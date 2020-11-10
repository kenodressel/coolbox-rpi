const express = require('express');
const app = express();

const gpio = require('rpi-gpio');
const gpiop = require('rpi-gpio').promise;
const dht11sensor = require("node-dht-sensor").promises;

// BCM NUMBERING
gpio.setMode(gpio.MODE_BCM)
const RELAY_1_PIN = 4;
const RELAY_2_PIN = 22;
const INNER_SENSOR = 17;

// global variables
const target = {
  temperature: 20,
  humidity: 50
};
let sensorData = {};
const PORT = 3000;

const setup = async () => {
  await gpiop.setup(RELAY_1_PIN, gpiop.DIR_OUT);
  await gpiop.setup(RELAY_2_PIN, gpiop.DIR_OUT);
}

const setPeltierState = async (active) => {
  // true = on
  // false = off
  await gpiop.write(RELAY_1_PIN, !!active);
}

const setPeltierHeating = async (heat) => {
  // true = heating
  // false = cooling
  await gpiop.write(RELAY_2_PIN, !!heat);
}

const bangBangController = (measured, target, tolerance) => {
  if(measured > target + tolerance) {
    return -1; // COOL
  }
  if(measured < target + tolerance) {
    return 1; // HEAT
  }
  return 0; // DO NOTHING
}

const readSensorData = async (sensor_pin) => {
  try {
    const res = await dht11sensor.read(11, sensor_pin);
    console.log(
      `temp: ${res.temperature.toFixed(1)}°C, ` +
      `humidity: ${res.humidity.toFixed(1)}%`
    );
    return res;
  } catch (e) {
    console.error("COULD NOT READ SENSORDATA :(")
    //  return fake data for dev purposes
    return {
      temperature: 1,
      humidity: 1
    }
  }

}

const startInterval = () => setInterval(async () => {
  sensorData = await readSensorData(INNER_SENSOR);

  const tempAction = bangBangController(sensorData.temperature, target.temperature, 2);
  console.log('tempAction', tempAction)
  if(tempAction === 0) {
    await setPeltierState(false);
  }
  if(tempAction === 1) {
    await setPeltierState(true);
    await setPeltierHeating(true);
  }
  if(tempAction === -1) {
    await setPeltierState(true);
    await setPeltierHeating(false);
  }
}, 500);

// respond with "hello world" when a GET request is made to the homepage
app.get('/', function(req, res) {
  console.log(__dirname + '/index.html')
  res.send({
    hello: "world"
  })
  //return res.sendFile(__dirname + '/index.html');
});
app.get('/sensor', async (req, res) => {
  res.send(sensorData);
});
app.post('/target', function(req, res) {
  target.temperature = res.body.temperature
  target.humidity = res.body.humidity
  res.sendStatus(200)
});

app.listen(PORT, "0.0.0.0",async () => {
  console.log(`Example app listening at http://localhost:${PORT}`)
  await setup()
  startInterval()
});