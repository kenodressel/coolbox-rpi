const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs');

app.use(express.json());

const gpio = require('rpi-gpio');
const gpiop = require('rpi-gpio').promise;
const dhtsensor = require('node-dht-sensor').promises;

// BCM NUMBERING
gpio.setMode(gpio.MODE_BCM);
const RELAY_1_PIN = 24;
const RELAY_2_PIN = 23;
const INNER_SENSOR = 25;

// global variables
const target = {
  temperature: 20,
  humidity: 50,
};
let sensorData = {};
const sensorHistory = [];
const chartData = JSON.parse(fs.readFileSync('chart.json').toString());
const peltier = {
  state: false,
  cooling: false,
};
const PORT = 3000;

const setup = async () => {
  await gpiop.setup(RELAY_1_PIN, gpiop.DIR_OUT);
  await gpiop.setup(RELAY_2_PIN, gpiop.DIR_OUT);
  await gpiop.setup(INNER_SENSOR, gpiop.DIR_IN);
};

const setPeltierState = async (active) => {
  // true = on
  // false = off
  console.log('setPeltierState', active);
  peltier.state = active;
  await gpiop.write(RELAY_1_PIN, !!active);
};

const setPeltierCooling = async (cool) => {
  // false = heating
  // true = cooling
  peltier.cooling = cool;
  console.log('setPeltierCooling', cool);
  await gpiop.write(RELAY_2_PIN, !!cool);
};

const bangBangController = (measured, target, overshoot, tolerance, lastAction) => {
  if (
    lastAction === -1 && measured > target - overshoot ||
    measured > target + overshoot + tolerance
  ) {
    return -1; // COOL
  }
  if (
    lastAction === 1 && measured < target + overshoot ||
    measured < target - overshoot - tolerance
  ) {
    return 1; // HEAT
  }
  return 0; // DO NOTHING
};

const updateSensorHistory = (sensor) => {
  sensorHistory.push({
    date: new Date(),
    target,
    sensor,
  });
  if (sensorHistory.length % 30 === 0) {
    chartData.push({
      date: new Date(),
      target,
      sensor,
    });
    fs.writeFileSync('./chart.json', JSON.stringify(chartData));
  }
};

const readSensorData = async (sensor_pin) => {
  try {
    const res = await dhtsensor.read(22, sensor_pin);
    console.log(
      `temp: ${res.temperature.toFixed(1)}°C, ` +
      `humidity: ${res.humidity.toFixed(1)}%`,
    );
    updateSensorHistory(res);
    return res;
  } catch (e) {
    console.error(e);
  }
  const historyLength = 5;
  const summedHistory = sensorHistory.slice(-1 * historyLength).reduce((acc, curr) => {
    acc.temperature += curr.temperature;
    acc.humidity += curr.humidity;
    return acc;
  }, { temperature: 0, humidity: 0 });
  return {
    temperature: summedHistory.temperature / historyLength,
    humidity: summedHistory.humidity / historyLength,
  };
};

const startInterval = () => {
  let lastAction = 0;
  setInterval(async () => {
    sensorData = await readSensorData(INNER_SENSOR);

    const tempAction = bangBangController(sensorData.temperature, target.temperature, 0.5, 1, lastAction);
    lastAction = tempAction;
    console.log('tempAction', tempAction);
    if (tempAction === 0) {
      await setPeltierState(false);
    }
    if (tempAction === 1) {
      await setPeltierState(true);
      await setPeltierCooling(false);
    }
    if (tempAction === -1) {
      await setPeltierState(true);
      await setPeltierCooling(true);
    }
  }, 1000);
};

// respond with "hello world" when a GET request is made to the homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/sensor', (req, res) => {
  res.send(sensorData);
});

app.get('/history', (req, res) => {
  res.send(chartData);
});

app.get('/target', (req, res) => {
  res.send(target);
});

app.get('/peltier', (req, res) => {
  res.send(peltier);
});

app.post('/target', function (req, res) {
  target.temperature = parseInt(req.body.temperature);
  target.humidity = parseInt(req.body.humidity);
  console.log(target);
  res.sendStatus(200);
});

const main = async () => {
  await setup();
  startInterval();
};

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Example app listening at http://localhost:${PORT}`);
  main();
});