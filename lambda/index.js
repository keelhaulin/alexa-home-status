import https from 'https';
import { SkillBuilders } from 'ask-sdk-core';

const HA_BASE_URL = process.env.HA_BASE_URL;
const HA_TOKEN = process.env.HA_TOKEN;
const HA_SENSOR = process.env.HA_SENSOR || 'sensor.house_status_summary';
const TIMEOUT_MS = 5000;

// Optional area map: { "kitchen": { "lights": [...], "doors": [...] }, ... }
let AREA_MAP = {};
try {
  if (process.env.AREA_MAP_JSON) AREA_MAP = JSON.parse(process.env.AREA_MAP_JSON);
} catch (e) {
  console.error('Invalid AREA_MAP_JSON:', e);
}

function fetchFromHA(path) {
  const url = new URL(path, HA_BASE_URL);
  const opts = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json'
    },
    timeout: TIMEOUT_MS
  };
  return new Promise((resolve, reject) => {
    const req = https.request(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, body: data });
        } else {
          reject(new Error(`HA ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('HA request timeout')); });
    req.end();
  });
}

function normalize(str='') {
  return String(str).trim().toLowerCase();
}

function titleize(id) {
  return id.replace(/^.*\./, '').replace(/_/g, ' ');
}

const GetHomeStatusHandler = {
  canHandle(handlerInput) {
    const r = handlerInput.requestEnvelope.request;
    return r.type === 'IntentRequest' && r.intent.name === 'GetHomeStatusIntent';
  },
  async handle(handlerInput) {
    try {
      const res = await fetchFromHA(`/api/states/${encodeURIComponent(HA_SENSOR)}`);
      const parsed = JSON.parse(res.body);
      const sentence = parsed.state && parsed.state !== 'unknown'
        ? parsed.state
        : 'I could not determine the current house status.';
      return handlerInput.responseBuilder
        .speak(sentence)
        .withSimpleCard('Home Status', sentence)
        .getResponse();
    } catch (err) {
      console.error(err);
      return handlerInput.responseBuilder
        .speak('Sorry, Home Assistant did not respond. Please try again.')
        .getResponse();
    }
  }
};

const GetDetailsIntentHandler = {
  canHandle(handlerInput) {
    const r = handlerInput.requestEnvelope.request;
    return r.type === 'IntentRequest' && r.intent.name === 'GetDetailsIntent';
  },
  async handle(handlerInput) {
    const r = handlerInput.requestEnvelope.request;
    const areaSlot = r.intent.slots && r.intent.slots.area && r.intent.slots.area.value;
    const area = areaSlot ? normalize(areaSlot) : '';

    try {
      // Pull all states at once
      const res = await fetchFromHA('/api/states');
      const all = JSON.parse(res.body);

      // Helper filters
      const lightsOn = all
        .filter(e => e.entity_id.startsWith('light.') && e.state === 'on');

      const doorsOpen = all
        .filter(e =>
          e.entity_id.startsWith('binary_sensor.') &&
          e.attributes?.device_class &&
          ['door','opening'].includes(e.attributes.device_class) &&
          e.state === 'on'
        );

      let filteredLights = lightsOn;
      let filteredDoors = doorsOpen;

      // Area filtering if AREA_MAP provided and area slot exists
      if (area && AREA_MAP[area]) {
        const allowedLights = new Set(AREA_MAP[area].lights || []);
        const allowedDoors = new Set(AREA_MAP[area].doors || []);
        filteredLights = lightsOn.filter(e => allowedLights.has(e.entity_id));
        filteredDoors = doorsOpen.filter(e => allowedDoors.has(e.entity_id));
      } else if (area && !AREA_MAP[area]) {
        // If user asked for area but we don't have a map for it
        const msg = `I don't have area mappings for ${area}. You can add them to the AREA_MAP_JSON setting.`;
        return handlerInput.responseBuilder.speak(msg).withSimpleCard('Home Details', msg).getResponse();
      }

      const lightNames = filteredLights.map(e => e.attributes.friendly_name || titleize(e.entity_id));
      const doorNames  = filteredDoors.map(e => e.attributes.friendly_name || titleize(e.entity_id));

      const bits = [];
      if (area) bits.push(`In the ${area}:`);

      bits.push(lightNames.length
        ? `Lights on: ${lightNames.join(', ')}`
        : `No lights are on${area ? ' there' : ''}`);

      bits.push(doorNames.length
        ? `Open doors: ${doorNames.join(', ')}`
        : `All doors are closed${area ? ' there' : ''}`);

      const speech = bits.join('. ') + '.';
      return handlerInput.responseBuilder
        .speak(speech)
        .withSimpleCard('Home Details', speech)
        .getResponse();

    } catch (err) {
      console.error(err);
      return handlerInput.responseBuilder
        .speak('Sorry, I could not get details from Home Assistant.')
        .getResponse();
    }
  }
};

const LaunchRequestHandler = {
  canHandle({ requestEnvelope }) {
    return requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    const prompt = 'Ask me how’s the house, or say details.';
    return handlerInput.responseBuilder.speak(prompt).reprompt(prompt).getResponse();
  }
};

const HelpIntentHandler = {
  canHandle({ requestEnvelope }) {
    const r = requestEnvelope.request;
    return r.type === 'IntentRequest' && r.intent.name === 'AMAZON.HelpIntent';
  },
  handle(handlerInput) {
    const msg = 'Say how’s the house, or which lights are on. You can also say, which doors are open in the kitchen.';
    return handlerInput.responseBuilder.speak(msg).reprompt(msg).getResponse();
  }
};

const CancelAndStopIntentHandler = {
  canHandle({ requestEnvelope }) {
    const r = requestEnvelope.request;
    return r.type === 'IntentRequest' && ['AMAZON.CancelIntent','AMAZON.StopIntent'].includes(r.intent.name);
  },
  handle(handlerInput) { return handlerInput.responseBuilder.speak('Okay.').getResponse(); }
};

const ErrorHandler = {
  canHandle: () => true,
  handle(handlerInput, error) {
    console.error('Unhandled error:', error);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong.')
      .getResponse();
  }
};

export const handler = SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    GetHomeStatusHandler,
    GetDetailsIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
