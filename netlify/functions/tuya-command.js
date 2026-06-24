const crypto = require('crypto');

const TUYA_CLIENT_ID = process.env.TUYA_CLIENT_ID;
const TUYA_CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET;
const TUYA_REGION = 'eu';

const COMMAND_MAPPING = {
  switch: { code: 'switch', value: (val) => val },
  temp_set: { code: 'temp_set', value: (val) => val },
  mode: { code: 'mode', value: (val) => val },
  fan_level: { code: 'fan_level', value: (val) => val },
  swing: { code: 'swing', value: (val) => val }
};

function generateSignature(method, path, payload, nonce, timestamp) {
  const contentHash = crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex');

  const stringToSign = [method, contentHash, '', path].join('\n');
  
  const hmacSha256 = crypto.createHmac('sha256', TUYA_CLIENT_SECRET);
  hmacSha256.update(stringToSign + '\n' + timestamp + '\n' + nonce);
  
  return Buffer.from(hmacSha256.digest()).toString('base64');
}

async function callTuyaAPI(method, path, payload = '') {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  const signature = generateSignature(method, path, payload, nonce, timestamp);

  const headers = {
    'client_id': TUYA_CLIENT_ID,
    'sign': signature,
    'sign_method': 'HMAC-SHA256',
    't': timestamp,
    'nonce': nonce,
    'Content-Type': 'application/json'
  };

  const url = `https://openapi.tuya${TUYA_REGION}.com${path}`;

  const response = await fetch(url, {
    method,
    headers,
    body: payload || undefined
  });

  return response.json();
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    if (!TUYA_CLIENT_ID || !TUYA_CLIENT_SECRET) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Credenziali Tuya non configurate. Aggiungi TUYA_CLIENT_ID e TUYA_CLIENT_SECRET nelle env variables.'
        })
      };
    }

    const { device_id, command, value } = JSON.parse(event.body);

    if (!device_id || !command) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: 'device_id e command obbligatori' })
      };
    }

    let tuya_command;
    if (COMMAND_MAPPING[command]) {
      tuya_command = {
        code: COMMAND_MAPPING[command].code,
        value: typeof COMMAND_MAPPING[command].value === 'function'
          ? COMMAND_MAPPING[command].value(value)
          : value
      };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: `Comando non supportato: ${command}` })
      };
    }

    const path = `/v1.0/devices/${device_id}/commands`;
    const payload = JSON.stringify({
      commands: [tuya_command]
    });

    const result = await callTuyaAPI('POST', path, payload);

    if (result.success) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: `Comando ${command} inviato correttamente`
        })
      };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: result.msg || 'Errore durante l\'invio del comando'
        })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
