
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const { banUser, unbanUser, isBanned } = require('./services/banned');
const {
  buscarPagoPorOperacion,
  buscarCodigoRegistroPorEmail,
  crearTokenAutocompletado
} = require('./services/querys');

const {
  QR_MESSAGE,
  SERVICE_MESSAGE,
  getCommandResponse,
  getRegisterCodeMessage,
  getPaymentInfoMessage,
  getTokenMessage,
  normalizeText
} = require('./utils/constants');

const resourcesPath = path.join(process.cwd(), 'resources');

const PAYMENT_MESSAGE_REGEX = /Mi código de pago es:\s*\*?(\d+)\*?/i;

const REGISTER_MESSAGE_REGEX =
  /hola[,\s]*no\s+me\s+lleg[oó]\s+el\s+c[oó]digo\s+de\s+registro[.\s]*mi\s+correo\s+es:\s*([^\s]+@[^\s]+)/i;

const TOKEN_COMMAND_REGEX = /^\/token(?:\s+(\d+))?$/i;

const duplicateMessages = new Map();
const DUPLICATE_WINDOW_MS = 4000;

let clientInstance = null;
let clientInitializing = null;
let clientReady = false;
let reconnectTimer = null;
let retryCount = 0;

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 8000;

// ==========================================
// IDENTIFICADORES DE WHATSAPP
// ==========================================

function getMessageChatId(msg) {
  if (!msg) return '';

  const raw = msg.fromMe ? msg.to : msg.from;

  if (typeof raw === 'string') {
    return raw;
  }

  return raw?._serialized || '';
}

function isValidChatId(chatId) {
  return (
    typeof chatId === 'string' &&
    /@(c\.us|lid)$/.test(chatId)
  );
}

async function resolveChatId(client, msg) {
  const fallback = getMessageChatId(msg);

  try {
    const chat = await msg.getChat();
    const id = chat?.id?._serialized;

    if (isValidChatId(id)) {
      return { chatId: id, chat };
    }
  } catch (error) {
    console.warn(
      '[WHATSAPP] No se pudo obtener el chat:',
      error.message
    );
  }

  if (isValidChatId(fallback)) {
    return {
      chatId: fallback,
      chat: null
    };
  }

  return {
    chatId: '',
    chat: null
  };
}

function getQuotedMessageId(msg) {
  const id = msg?.id;

  if (!id) return undefined;

  if (id._serialized) {
    return id._serialized;
  }

  if (id.id && id.remote) {
    return `${id.fromMe}_${id.remote}_${id.id}`;
  }

  return undefined;
}

// ==========================================
// VALIDACIÓN DE MENSAJES
// ==========================================

function isSlashCommand(text) {
  return /^\/\S+(?:\s+\S.*)?$|^\/$/.test(
    String(text || '').trim()
  );
}

function shouldProcessMessage(msg) {
  const chatId = getMessageChatId(msg);

  if (!chatId) return false;
  if (chatId.includes('@g.us')) return false;
  if (chatId.includes('@newsletter')) return false;
  if (chatId.includes('@broadcast')) return false;

  if (msg.fromMe) {
    return isSlashCommand(msg.body);
  }

  return true;
}

// ==========================================
// CONTROL DE DUPLICADOS
// ==========================================

function shouldBlockDuplicate(senderId, normalizedText) {
  if (!senderId || !normalizedText) return false;

  const now = Date.now();
  const last = duplicateMessages.get(senderId);

  if (
    last &&
    last.text === normalizedText &&
    now - last.at < DUPLICATE_WINDOW_MS
  ) {
    return true;
  }

  duplicateMessages.set(senderId, {
    text: normalizedText,
    at: now
  });

  return false;
}

function cleanupDuplicateMessages() {
  const now = Date.now();

  for (const [senderId, value] of duplicateMessages.entries()) {
    if (
      !value ||
      now - value.at > DUPLICATE_WINDOW_MS * 3
    ) {
      duplicateMessages.delete(senderId);
    }
  }
}

// ==========================================
// RESPUESTAS
// ==========================================

function normalizeResponse(response) {
  if (!response) return [];

  if (typeof response === 'string') {
    return [{ text: response, reply: false }];
  }

  if (Array.isArray(response)) {
    return response.map(item => ({
      ...item,
      reply: item?.reply === true
    }));
  }

  return [{
    ...response,
    reply: response?.reply === true
  }];
}

// ==========================================
// CONSULTAS ESPECIALES
// ==========================================

async function getSpecialQueryResponse(text) {
  const paymentMatch = text.match(PAYMENT_MESSAGE_REGEX);

  if (paymentMatch) {
    const cip = paymentMatch[1];
    const resp = await buscarPagoPorOperacion(cip);

    if (!resp.ok) {
      return {
        text: resp.message
      };
    }

    const pago = resp.data;
    const email = pago.email || null;
    const precio = pago.amount ?? 50;

    const nombre = email
      ? String(email).split('@')[0]
      : '-';

    const monto = Number(precio).toFixed(2);

    return [
      {
        image: 'qr.png',
        text: getPaymentInfoMessage(nombre, monto)
      },
      {
        gif: 'videos/escanear_qr.mp4',
        text: QR_MESSAGE(monto)
      }
    ];
  }

  const registerMatch =
    String(text || '').match(REGISTER_MESSAGE_REGEX) ||
    normalizeText(text).match(REGISTER_MESSAGE_REGEX);

  if (registerMatch) {
    const email = registerMatch[1]
      .trim()
      .replace(/[.,;:!?]+$/, '')
      .toLowerCase();

    const resp = await buscarCodigoRegistroPorEmail(email);

    if (!resp.ok) {
      return {
        text: resp.message,
        reply: true
      };
    }

    return {
      text: getRegisterCodeMessage(resp.data.code),
      reply: true
    };
  }

  return null;
}

async function getResponseConfig(text, normalizedText) {
  const specialResponse = await getSpecialQueryResponse(text);

  if (specialResponse) {
    return specialResponse;
  }

  const serviceRequestResponse = SERVICE_MESSAGE(
    text,
    normalizedText
  );

  if (serviceRequestResponse) {
    return serviceRequestResponse;
  }

  const directResponse = getCommandResponse(normalizedText);

  if (directResponse) {
    return directResponse;
  }

  return null;
}

// ==========================================
// SIMULACIÓN DE ESCRITURA
// ==========================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTypingDelay(text) {
  const length = String(text || '').length;
  const base = 300;
  const perChar = 8;
  const jitter = Math.floor(Math.random() * 400);

  return Math.min(
    base + length * perChar + jitter,
    1500
  );
}

async function simulateTyping(chat, text) {
  try {
    if (!chat) return;

    await chat.sendStateTyping();
    await sleep(getTypingDelay(text));
    await chat.clearState();
  } catch (error) {
    console.warn(
      '[WHATSAPP] No se pudo simular escritura:',
      error.message
    );
  }
}

// ==========================================
// MULTIMEDIA
// ==========================================

function resolveResourcePath(filePath) {
  return path.isAbsolute(filePath)
    ? filePath
    : path.join(resourcesPath, filePath);
}

const mediaCache = new Map();

function getCachedMedia(filePath) {
  if (mediaCache.has(filePath)) {
    return mediaCache.get(filePath);
  }

  const media = MessageMedia.fromFilePath(filePath);

  mediaCache.set(filePath, media);

  return media;
}

async function sendMediaMessage(
  client,
  chatId,
  mediaPath,
  options = {},
  extraOptions = {}
) {
  if (client !== clientInstance || !clientReady) {
    console.warn('[WHATSAPP] Cliente no disponible');
    return false;
  }

  if (!isValidChatId(chatId)) {
    console.error(
      '[WHATSAPP] Identificador inválido:',
      chatId
    );
    return false;
  }

  const filePath = resolveResourcePath(mediaPath);

  if (!fs.existsSync(filePath)) {
    console.error(
      '[WHATSAPP] Archivo no encontrado:',
      filePath
    );
    return false;
  }

  try {
    const media = getCachedMedia(filePath);

    const sendOptions = {
      ...options,
      ...extraOptions
    };

    await client.sendMessage(
      chatId,
      media,
      sendOptions
    );

    console.log(
      '[WHATSAPP] Multimedia enviada:',
      path.basename(filePath)
    );

    return true;
  } catch (error) {
    console.error('[WHATSAPP] Error enviando multimedia:', {
      chatId,
      filePath,
      message: error.message
    });

    return false;
  }
}

// ==========================================
// ENVÍO SEGURO DE TEXTO
// ==========================================

async function sendTextMessage(
  client,
  chatId,
  text,
  options = {}
) {
  if (
    client !== clientInstance ||
    !clientReady ||
    !isValidChatId(chatId)
  ) {
    return false;
  }

  try {
    await client.sendMessage(
      chatId,
      String(text),
      options
    );

    return true;
  } catch (error) {
    console.error('[WHATSAPP] Error enviando texto:', {
      chatId,
      message: error.message
    });

    return false;
  }
}

// ==========================================
// ENVÍO DE RESPUESTAS
// ==========================================

async function sendNormalizedResponse(
  client,
  originalMsg,
  response
) {
  const messages = normalizeResponse(response);

  const { chatId, chat } = await resolveChatId(
    client,
    originalMsg
  );

  if (!chatId) {
    console.warn(
      '[WHATSAPP] Respuesta omitida: chat inválido'
    );
    return;
  }

  const quotedMessageId = getQuotedMessageId(originalMsg);

  for (const msg of messages) {
    if (client !== clientInstance || !clientReady) {
      break;
    }

    const text =
      typeof msg.text === 'string'
        ? msg.text.trim()
        : '';

    const reply = msg.reply === true;

    const options = {
      caption: text || undefined,
      quotedMessageId: reply
        ? quotedMessageId
        : undefined
    };

    if (text && chat) {
      await simulateTyping(chat, text);
    }

    let mediaSent = false;

    const mediaList = [
      {
        value: msg.gif,
        extra: { sendVideoAsGif: true }
      },
      {
        value: msg.image,
        extra: {}
      },
      {
        value: msg.video,
        extra: {}
      },
      {
        value: msg.file,
        extra: { sendMediaAsDocument: true }
      }
    ];

    for (const media of mediaList) {
      const value =
        typeof media.value === 'string'
          ? media.value.trim()
          : '';

      if (!value) continue;

      const sent = await sendMediaMessage(
        client,
        chatId,
        value,
        options,
        media.extra
      );

      if (sent) {
        mediaSent = true;
        break;
      }
    }

    if (!mediaSent && text) {
      await sendTextMessage(
        client,
        chatId,
        text,
        {
          quotedMessageId: options.quotedMessageId
        }
      );
    }
  }
}

// ==========================================
// MENSAJES ENTRANTES
// ==========================================

async function onNewMessage(msg) {
  try {
    if (!clientInstance || !clientReady) return;
    if (!shouldProcessMessage(msg)) return;
    if (!msg.body) return;

    cleanupDuplicateMessages();

    const senderId = getMessageChatId(msg);

    if (!senderId) return;

    const normalizedText = normalizeText(msg.body);

    // COMANDOS ADMIN
    if (msg.fromMe) {
      const myId =
        clientInstance.info?.wid?._serialized;

      if (normalizedText === '/off') {
        if (senderId === myId) return;

        banUser(senderId);
        return;
      }

      if (normalizedText === '/on') {
        if (senderId === myId) return;

        unbanUser(senderId);
        return;
      }

      const tokenMatch = normalizedText.match(
        TOKEN_COMMAND_REGEX
      );

      if (tokenMatch) {
        const days = tokenMatch[1]
          ? parseInt(tokenMatch[1], 10)
          : 7;

        const resp = await crearTokenAutocompletado(days);

        if (!resp.ok) {
          await sendTextMessage(
            clientInstance,
            senderId,
            resp.message
          );
          return;
        }

        await sendMediaMessage(
          clientInstance,
          senderId,
          'auto.png',
          {
            caption: getTokenMessage(days)
          }
        );

        await sendTextMessage(
          clientInstance,
          senderId,
          resp.data.token
        );

        return;
      }
    }

    // USUARIOS BLOQUEADOS
    if (!msg.fromMe && isBanned(senderId)) {
      return;
    }

    // ANTIDUPLICADOS
    if (shouldBlockDuplicate(senderId, normalizedText)) {
      return;
    }

    // RESPUESTAS NORMALES
    const response = await getResponseConfig(
      msg.body,
      normalizedText
    );

    if (!response) return;

    await sendNormalizedResponse(
      clientInstance,
      msg,
      response
    );

  } catch (error) {
    console.error(
      '[WHATSAPP] Error en handler:',
      error
    );
  }
}

// ==========================================
// CLIENTE DE WHATSAPP
// ==========================================

function createWhatsAppClient() {
  const sessionPath = path.join(
    process.cwd(),
    '.wwebjs_auth'
  );

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH;

  if (!fs.existsSync(sessionPath)) {
    fs.mkdirSync(sessionPath, {
      recursive: true
    });
  }

  return new Client({
    authStrategy: new LocalAuth({
      clientId: 'main',
      dataPath: sessionPath
    }),

    puppeteer: {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    },

    authTimeoutMs: 120000,
    qrMaxRetries: 10
  });
}

// ==========================================
// INICIO DEL BOT
// ==========================================

async function startWhatsAppBot() {
  if (clientInstance) {
    return clientInstance;
  }

  if (clientInitializing) {
    return clientInitializing;
  }

  clientInitializing = (async () => {
    const client = createWhatsAppClient();

    clientInstance = client;
    clientReady = false;

    client.on('qr', qr => {
      console.log(
        '[WHATSAPP] Escanea este QR:'
      );

      qrcode.generate(qr, {
        small: true
      });
    });

    client.on('change_state', state => {
      console.log(
        '[WHATSAPP] Estado:',
        state
      );
    });

    client.on('authenticated', () => {
      console.log(
        '[WHATSAPP] Sesión autenticada'
      );
    });

    client.on('ready', () => {
      clientReady = true;
      retryCount = 0;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      const wid =
        client.info?.wid?._serialized ||
        'sin_wid';

      console.log(
        `[WHATSAPP] Conectado como: ${wid}`
      );
    });

    client.on('auth_failure', async msg => {
      console.error(
        '[WHATSAPP] Error de autenticación:',
        msg
      );

      clientReady = false;

      if (clientInstance === client) {
        clientInstance = null;
      }

      clientInitializing = null;

      try {
        await client.destroy();
      } catch (error) {
        console.warn(
          '[WHATSAPP] Error cerrando cliente:',
          error.message
        );
      }

      console.warn(
        '[WHATSAPP] Sesión conservada para diagnóstico'
      );

      scheduleReconnect();
    });

    client.on('disconnected', async reason => {
      console.warn(
        '[WHATSAPP] Desconectado:',
        reason
      );

      clientReady = false;

      if (clientInstance === client) {
        clientInstance = null;
      }

      clientInitializing = null;

      try {
        await client.destroy();
      } catch (error) {
        console.warn(
          '[WHATSAPP] Error cerrando cliente:',
          error.message
        );
      }

      if (
        reason === 'CONFLICT' ||
        reason === 'UNLAUNCHED'
      ) {
        console.error(
          '[WHATSAPP] Conflicto detectado'
        );

        process.exit(1);
        return;
      }

      scheduleReconnect();
    });

    client.on('message', onNewMessage);

    client.on('message_create', msg => {
      if (msg.fromMe) {
        onNewMessage(msg);
      }
    });

    try {
      await client.initialize();

      clientInitializing = null;

      return client;
    } catch (error) {
      console.error(
        '[WHATSAPP] Error inicializando:',
        error.message
      );

      clientReady = false;

      if (clientInstance === client) {
        clientInstance = null;
      }

      clientInitializing = null;

      try {
        await client.destroy();
      } catch (_) {}

      scheduleReconnect();

      throw error;
    }
  })();

  return clientInitializing;
}

// ==========================================
// RECONEXIÓN AUTOMÁTICA
// ==========================================

function scheduleReconnect() {
  if (reconnectTimer) return;

  if (retryCount >= MAX_RETRIES) {
    console.error(
      '[WHATSAPP] Máximo de reintentos alcanzado'
    );

    process.exit(1);
    return;
  }

  retryCount++;

  const delay = RETRY_DELAY_MS * retryCount;

  console.log(
    `[WHATSAPP] Reconectando en ${delay / 1000}s`
  );

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    try {
      await startWhatsAppBot();
    } catch (error) {
      console.error(
        '[WHATSAPP] Error al reconectar:',
        error.message
      );
    }
  }, delay);
}

// ==========================================
// EXPORTACIÓN
// ==========================================

module.exports = {
  startWhatsAppBot
};
