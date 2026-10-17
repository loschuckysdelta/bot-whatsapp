
const {
  TITLE_PRODUCT,
  PRICE_PRODUCT,
  FILE_APK,
  MSG_HELP_1,
  MSG_HELP_2,
  MSG_HELP_3,
} = require('./data');

const YEAR = new Date().getFullYear();

// =======================================
// NORMALIZAR TEXTOS
// =======================================

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[1-9]️⃣/g, match => match[0])
    .replace(/\s+/g, ' ')
    .trim();
}

// =======================================
// INFORMACIÓN DE YAPE
// =======================================

function YAPE_MESSAGE() {
  return [
    `🚀 *${TITLE_PRODUCT} - ${YEAR}*`,
    '',
    'Activa tu licencia de forma segura aquí.',
    `💰 *Precio:* S/ ${PRICE_PRODUCT}`,
    '',
    '✅ *Pago único*',
    '✅ *Acceso permanente*',
    '✅ *Actualizaciones automáticas*',
    '',
    'Si deseas adquirirlo, escribe: `/pagar`',
  ].join('\n');
}

// =======================================
// INSTRUCCIONES DE PAGO
// =======================================

function QR_MESSAGE(precio = PRICE_PRODUCT) {
  const monto = Number(precio).toFixed(2);

  return [
    '✏️ *Instrucciones de pago con QR*',
    '',
    '1️⃣ Toma captura o guarda el QR.',
    '2️⃣ Busca la opción *Escanear QR*.',
    '3️⃣ Selecciona *Subir imagen*.',
    `4️⃣ Realiza el pago de *S/ ${monto}*.`,
    '5️⃣ Envía el comprobante por este chat.',
    '',
    '⏳ Una vez verificado el pago, activaré la licencia con tu correo.',
  ].join('\n');
}

function getPaymentYapeMessage() {
  return [
    '💳 Métodos de pago: *Yape/Plin*',
    '👤 Titular: *JUAN ALEX*',
  ].join('\n');
}

// =======================================
// TUTORIALES
// =======================================

const COMMAND_TUTORIALS = {
  '/escanear': {
    video: 'videos/escanear.mp4',
    text: [
      '📷 *Función Escanear*',
      '',
      'Sube una imagen nítida y legible para que la app pueda extraer correctamente la información.',
      '',
      'Puedes usarla de tres formas:',
      '',
      '1️⃣ *Imagen de QR*',
      'Sube una imagen del QR donde se visualice el texto (IMPORTANTE).',
      '',
      '2️⃣ *Voucher de Yape*',
      'Sube una captura del comprobante.',
      'La app identificará el nombre del titular y sus 3 últimos dígitos.',
      '',
      '3️⃣ Screenshot *(Solo iPhone)*',
      'Al momento de buscar el titular de línea, toma un screenshot y súbelo.',
      'La app se encargará de extraer la información.',
    ].join('\n'),
  },

  '/autocompletar': {
    video: 'videos/autocompletar.mp4',
    text: [
      '⚡ *Autocompletado Manual*',
      '',
      '1️⃣ Ve a la sección *Mis contactos*',
      '2️⃣ Guarda el nombre y número',
      '3️⃣ ¡Listo! Ya puedes yapear',
    ].join('\n'),
  },
};

// =======================================
// COMANDOS PRINCIPALES
// =======================================

const COMMAND_RESPONSES = {
  'buenos dias': {
    text: 'Hola, ¿en qué puedo ayudarte?',
  },

  [normalizeText(MSG_HELP_1)]: {
    text: 'Hola, ¿en qué puedo ayudarte?',
  },

  [normalizeText(MSG_HELP_2)]: {
    text: 'Hola, ¿en qué puedo ayudarte?',
  },

  [normalizeText(MSG_HELP_3)]: {
    text: 'Hola, ¿eres Android o iPhone?',
  },

  'hola informacion sobre el yape.': {
    image: 'yape.png',
    text: YAPE_MESSAGE(),
  },

  '/info': {
    image: 'yape.png',
    text: YAPE_MESSAGE(),
  },

  // =====================================
  // COMANDO /PAGAR
  // =====================================

  '/pagar': () => [
    {
      image: 'qr.png',
      text: getPaymentYapeMessage(),
    },
    {
      gif: 'videos/escanear_qr.mp4',
      text: QR_MESSAGE(),
    },
  ],

  '/qr': {
    image: 'qr.png',
  },

  '/apk': [
    {
      text: [
        `📲 *DESCARGA DE APK - ANDROID ${YEAR}*`,
        '',
        '⚠️ *Si sale la advertencia Google Play Protect:*',
        '1️⃣ Revisa los detalles y el origen de la aplicación.',
        '2️⃣ Instala solamente si confías en el archivo.',
      ].join('\n'),
    },
    {
      file: FILE_APK,
      text: null,
    },
    {
      text: 'Antes de instalar, si tienes otras versiones, bórralas e instala la nueva.',
    },
  ],

  '/iphone': () => [
    {
      text: [
        '*LINK OFICIAL* 👇👇👇',
        'https://ypfkplus.com/',
        '',
        '🍏 *Cómo instalar en iPhone*',
        '',
        '1️⃣ Abre el link desde *Safari*',
        '2️⃣ Busca el ícono de *Compartir* 📤.',
        '3️⃣ Desliza y selecciona *Agregar a inicio*.',
        '4️⃣ Toca *Agregar*.',
        '',
        '✅ Listo, ya tienes el ícono en tu celular.',
        '',
        '👇 Aquí tienes un tutorial:',
      ].join('\n'),
    },
    {
      gif: 'videos/iphone.mp4',
    },
  ],

  '/activacion': {
    text: [
      '🔐 *Activación de licencia*',
      '',
      'Si realizaste el pago con *PagoEfectivo*, espera aproximadamente *1 minuto* para que el sistema registre el pago.',
      '',
      'Una vez confirmado el pago o activación, actualiza la aplicación de cualquiera de estas formas:',
      '',
      '1️⃣ *Cerrar sesión y volver a ingresar*',
      '• Presiona el ícono de la *personita* en la parte superior.',
      '• Busca la opción *Cerrar sesión*.',
      '• Vuelve a iniciar sesión en la aplicación.',
      '',
      '2️⃣ *Reiniciar la aplicación*',
      '• Cierra completamente la app.',
      '• Ábrela nuevamente para que se reflejen los cambios.',
      '',
      '📌 *Si realizaste el pago a un distribuidor autorizado*',
      '• Debes esperar a que el distribuidor responda y valide tu pago.',
    ].join('\n'),
  },

  '/soporte': {
    text: [
      '⚙️ *Soporte y mejoras de la aplicación*',
      '',
      'Si detectaste un error, diferencia o deseas sugerir una mejora, envíame una *captura de pantalla* donde se vea claramente la observación.',
      '',
      'Para poder revisarlo incluye:',
      '• Una breve explicación de lo que ocurre.',
      '• Señala con un *lápiz* la parte donde está el problema.',
      '• El modelo de tu teléfono (opcional).',
      '',
      'Con esa información podré revisarlo para correg o mejorar la aplicación.',
    ].join('\n'),
  },

  '/estafas': {
    text: [
      '❗ *Aviso importante*',
      '',
      'No realizamos ventas por TikTok, Facebook ni otros números de WhatsApp. Solo atendemos por este número.',
      '',
      'Si realizaste un pago a una persona no autorizada o alguien utilizó mi producto para engañarte, lamentablemente no tengo control sobre esas acciones.',
      '',
      '⚠️ Recuerda que:',
      '• Las advertencias se muestran al momento de registrarte.',
      '• Mi número siempre aparece en la *marca de agua* del contenido.',
      '• La aplicación es pública y puede descargarse gratis desde mi perfil.',
    ].join('\n'),
  },

  ...COMMAND_TUTORIALS,
};

// =======================================
// DETECTOR HOLA CHUCKY
// =======================================

function SERVICE_MESSAGE(text, normalizedText) {
  const msg = normalizeText(normalizedText || text)
    .replace(/[.,!?¿¡:;]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Detecta:
  // Hola Chucky, quisiera solicitar
  // Hola Chucky. Quisiera solicitar
  // HOLA CHUCKY QUISIERA SOLICITAR
  // Hola Chucky, quisiera solicitar servicio...

  const esSolicitud =
    /\bhola\s+chucky\b/.test(msg) &&
    /\bquisiera\s+solicitar\b/.test(msg);

  if (!esSolicitud) {
    return null;
  }

  console.log(
    '✅ [SERVICE] Solicitud detectada: enviando /pagar'
  );

  // EXACTAMENTE LA MISMA RESPUESTA
  return getCommandResponse('/pagar');
}

// =======================================
// OBTENER RESPUESTA DE COMANDOS
// =======================================

function getCommandResponse(normalizedText) {
  const texto = normalizeText(normalizedText);

  // Primero reconocer comandos normales
  let response = COMMAND_RESPONSES[texto] ?? null;

  // Si no es un comando, detectar solicitud
  if (response === null) {
    return SERVICE_MESSAGE(texto, texto);
  }

  // Ejecutar comandos dinámicos como /pagar
  if (typeof response === 'function') {
    response = response();
  }

  return response;
}

// =======================================
// INFORMACIÓN DE PAGO
// =======================================

function getPaymentInfoMessage(nombre, monto) {
  return [
    '💳 *Información de pago*',
    '',
    `👤 Usuario: *${nombre}*`,
    `💰 Monto a pagar: *S/${monto}*`,
  ].join('\n');
}

// =======================================
// CÓDIGO DE REGISTRO
// =======================================

function getRegisterCodeMessage(code) {
  return [
    '🔐 *Código de verificación*',
    'Utiliza el siguiente código para completar tu registro:',
    '',
    `*${code}*`,
  ].join('\n');
}

// =======================================
// MENSAJE TOKEN
// =======================================

function getTokenMessage(days) {
  return `🎉 *AUTOCOMPLETADO POR ${days} DÍA${days > 1 ? 'S' : ''}*

Para empezar a usarlo:

✅ 1. Copia el token.
✅ 2. Ve a *Configuración*.
✅ 3. Pégalo y pulsa *"Activar"*.

🚀 *Este es tu token:* 👇👇👇`;
}

// =======================================
// EXPORTAR FUNCIONES
// =======================================

module.exports = {
  COMMAND_RESPONSES,
  QR_MESSAGE,
  SERVICE_MESSAGE,
  getCommandResponse,
  getPaymentInfoMessage,
  getRegisterCodeMessage,
  getTokenMessage,
  normalizeText,
};
