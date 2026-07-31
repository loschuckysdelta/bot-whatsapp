const axios = require('axios');

const apiQuery = axios.create({
  baseURL: 'https://server-yape.vercel.app/api/query',
  headers: { 'x-api-key': 'MELEYS' },
  timeout: 5000,
});

const apiXpress = axios.create({
  baseURL: 'https://server-yape.vercel.app/api/xpress',
  headers: { 'x-api-key': 'MELEYS' },
  timeout: 5000,
});

const apiChucky = axios.create({
  baseURL: 'https://server-yape.vercel.app/api/chucky',
  headers: { 'x-api-key': 'MELEYS' },
  timeout: 5000,
});

async function buscarPagoPorOperacion(cip) {
  try {
    const { data } = await apiQuery.get(`/payment/${cip}`);

    return { ok: true, data, message: '' };
  } catch (error) {
    if (error.response?.status === 404) {
      return { ok: false, data: null, message: `No se encontró ningún pago con el código ${cip}` };
    }

    console.error('[API] buscarPagoPorOperacion:', error.response?.data || error.message);

    return { ok: false, data: null, message: 'No se pudo consultar la información del pago.' };
  }
}

async function buscarCodigoRegistroPorEmail(email) {
  try {
    const { data } = await apiChucky.get('/info_user', {
      params: { email: String(email || '').trim().toLowerCase() },
    });

    const code = data?.code;

    if (code === undefined || code === null || String(code).trim() === '') {
      return {
        ok: false,
        data: null,
        message: 'No encontramos un código de registro para este correo.',
      };
    }

    return {
      ok: true,
      data: {
        ...data,
        code: String(code).trim(),
      },
      message: '',
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return {
        ok: false,
        data: null,
        message: 'No encontramos un usuario registrado con este correo.',
      };
    }

    console.error('[API] buscarCodigoRegistroPorEmail:', error.response?.data || error.message);

    return {
      ok: false,
      data: null,
      message: 'No se pudo consultar el código de registro.',
    };
  }
}

async function crearTokenAutocompletado(days) {
  try {
    const { data } = await apiXpress.post('/create_token', { days });

    if (!data?.status) {
      return { ok: false, data: null, message: data?.msg || 'No se pudo generar el token.' };
    }

    return { ok: true, data, message: '' };
  } catch (error) {
    console.error('[API] crearTokenAutocompletado:', error.response?.data || error.message);

    return { ok: false, data: null, message: 'No se pudo generar el token.' };
  }
}

module.exports = {
  buscarPagoPorOperacion,
  buscarCodigoRegistroPorEmail,
  crearTokenAutocompletado,
};
