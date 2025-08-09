# Alexa Home Status Skill (Home Assistant + GetDetailsIntent)

## Overview
Private Alexa skill that speaks a dynamic home status from Home Assistant and answers follow‑ups like:
- “**How’s the house?**”
- “**Which lights are on?**”
- “**Which doors are open?**”
- “**Which lights are on in the kitchen?**” (area‑filtered)

## Goals
- Voice summary (“how’s the house?”) driven by HA templates.
- Details intent to enumerate specific devices.
- Easy to extend without deep coding.

## Tech
- Alexa Skills Kit (Custom)
- AWS Lambda (Node.js 18)
- Home Assistant + Nabu Casa
- HA Templates (Jinja2)

---

## Setup

### 1) Home Assistant templates
Add `home-assistant/house_status_template.yaml` to your HA config and restart. It creates `sensor.house_status_summary`.

Optionally add `home-assistant/areas_example.yaml` if you want **area filtering** and adapt entity lists to your home.

### 2) Alexa skill (Developer Console)
- Custom Skill → Invocation name: `home status`
- Intents:
  - `GetHomeStatusIntent` (status)
  - `GetDetailsIntent` (details, with optional `area` slot)
- Import/Apply the interaction model from `alexa/interaction-model.json` (or copy its parts).

### 3) Lambda (us-east-1)
- Create function in `us-east-1` (Node.js 18).
- Upload `lambda/index.js`, set timeout ~7–10s.
- Env vars (see `.env.example`):
  - `HA_BASE_URL`, `HA_TOKEN`, `HA_SENSOR`
  - Optional: `AREA_MAP_JSON` (JSON map of area → arrays of entity_ids)

### 4) Add trigger & wire endpoint
- Lambda → Triggers → **Alexa Skills Kit** → paste **Skill ID**.
- Alexa console → Endpoint → **AWS Lambda ARN** (us‑east‑1) → Save & Build.

### 5) Test
- “Alexa, open home status.”
- “How’s the house?”
- “Which lights are on?”
- “Which doors are open in the kitchen?”

---

## Enhancements
- Add more categories (windows, blinds, fans) in Lambda.
- Expand SSML for clearer speech.
- Add proactive announcements (advanced).
- Add more utterances and area synonyms in the interaction model.

---

## Security
- Keep the HA long‑lived token secret and rotate periodically.
- Skill remains **private** in Development stage until you submit for certification.

---

## Files

alexa-home-status/
├── README.md
├── lambda/ # AWS Lambda backend
│ ├── index.js
│ ├── package.json
│ └── .env.example
├── home-assistant/ # HA template sensor definition
│ └── house_status_template.yaml
│ └── areas_example.yaml
└── interaction-model.json


### `home-assistant/house_status_template.yaml`
Creates the main summary sensor. Tweak entities/phrasing to taste.

```yaml
template:
  - sensor:
      - name: house_status_summary
        state: >
          {% set lights_on = states.light | selectattr('state','eq','on') | list | count %}
          {% set doors_open = states.binary_sensor
              | selectattr('attributes.device_class','defined')
              | selectattr('attributes.device_class','in',['door','opening'])
              | selectattr('state','eq','on') | list | count %}
          {% set windows_open = states.binary_sensor
              | selectattr('attributes.device_class','defined')
              | selectattr('attributes.device_class','in',['window'])
              | selectattr('state','eq','on') | list | count %}
          {% set garage_open = states('binary_sensor.garage_door') == 'on' %}
          {% set alarm = states('alarm_control_panel.home_alarm') %}
          {% set inside = states('sensor.upstairs_temperature') | default('unknown') %}
          {% set humidity = states('sensor.upstairs_humidity') | default('unknown') %}
          {% set parts = [] %}
          {% if lights_on > 0 %}
            {% set _ = parts.append(lights_on ~ ' light' ~ ('s' if lights_on != 1 else '') ~ ' on') %}
          {% else %}
            {% set _ = parts.append('all lights off') %}
          {% endif %}
          {% if doors_open > 0 or windows_open > 0 %}
            {% set _ = parts.append(doors_open ~ ' door' ~ ('s' if doors_open != 1 else '') ~ ' open, ' ~ windows_open ~ ' window' ~ ('s' if windows_open != 1 else '') ~ ' open') %}
          {% else %}
            {% set _ = parts.append('all doors and windows closed') %}
          {% endif %}
          {% if garage_open %}{% set _ = parts.append('garage is open') %}{% endif %}
          {% if alarm in ['armed_home','armed_away'] %}
            {% set _ = parts.append('security is armed') %}
          {% elif alarm == 'disarmed' %}
            {% set _ = parts.append('security is disarmed') %}
          {% endif %}
          {% if inside != 'unknown' %}
            {% set _ = parts.append('inside ' ~ inside ~ ' degrees') %}
          {% endif %}
          {% if humidity != 'unknown' %}
            {% set _ = parts.append(humidity ~ ' percent humidity') %}
          {% endif %}
          {{ parts | reject('equalto','') | list | join('. ') }}.


