# Alexa Home Status Skill (with Home Assistant)

## Overview
This project creates a **private Alexa skill** that delivers a **spoken summary** of your home's status from Home Assistant, using a Nabu Casa remote connection.

When you say:

> "Alexa, ask Home Status how's the house?"

Alexa responds with a dynamic summary based on live data from Home Assistant—lights, doors, windows, garage, alarm, temperature, and humidity.

---

## Project Goals
- Voice-activated home summary available on Alexa devices.
- Keep business logic in Home Assistant templates (no code redeploy for changes).
- Maintain privacy: skill works only on your Alexa account in development mode.
- Easy to extend with new data points.

---

## Technologies Used
- **Amazon Alexa Skills Kit (ASK)**
- **AWS Lambda** (Node.js 18)
- **Home Assistant** (Template sensors via Jinja2)
- **Nabu Casa Remote URL**
- **Alexa Developer Console**
- **CloudWatch Logs**

---

## File Structure
