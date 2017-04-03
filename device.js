// Load node modules

const schedule = require('node-schedule');
const fs = require('fs');
const sys = require('sys');
const http = require('http');

const TMClient = require('textmagic-rest-client');
const nodemailer = require('nodemailer');
const path = require('path');

const mqtt = require('mqtt');

const DEVICE = '10.0.0.158';
const MQTT_HOST = 'mqtt://10.0.0.61:1883';
const MQTT_BROKER_USER = 'josh';
const MQTT_BROKER_PASS = 'Isabella2030';
const mongoose = require('mongoose');
const configDB = require('./models/database.js');

const db = mongoose.connection;
mongoose.Promise = require('q').Promise;
const temp = require('./models/temprature.js');

let lastReconnectAttempt;
let error = '';
let errorLoged;
let ncurrentcoolerrunftime;
let mongooptions = {
  server: { auto_reconnect: true }
};

const smtpTransport = nodemailer.createTransport('SMTP', {
  service: 'Gmail',
  auth: {
    user: 'powerinside777@gmail.com',
    pass: 'myjesus0101',
  },
});

const sendtimerdata = new schedule.RecurrenceRule();
const settings = {
  username: MQTT_BROKER_USER,
  password: MQTT_BROKER_PASS,
};

mongoose.connect(configDB.url, mongooptions)


db.on('error', (error) => {
  console.error(`Error in MongoDb connection: ${error}`);
  mongoose.disconnect();
});
db.on('disconnected', () => {
  console.log('MongoDB disconnected!');
  const now = new Date().getTime();
  error += `MongoDB disconnected!${now}`;
  setTimeout(() => {
    const now = new Date().getTime();
        // check if the last reconnection attempt was too early
    if (lastReconnectAttempt && now - lastReconnectAttempt < 5000) {
            // if it does, delay the next attempt
      const delay = 5000 - (now - lastReconnectAttempt);
      console.log(`reconnecting to MongoDB in ${delay}mills`);
      setTimeout(() => {
        console.log('reconnecting to MongoDB');
        lastReconnectAttempt = new Date().getTime();
        mongoose.connect(configDB.url, { server: { auto_reconnect: true } });
      }, delay);
    } else {
      console.log('reconnecting to MongoDB');
      lastReconnectAttempt = now;
      mongoose.connect(configDB.url, { server: { auto_reconnect: true } });
    }
  }, 900000);
});
db.on('connected', () => {
  updatedata();
  console.log('coonected to db');
});
const mqtt_client = mqtt.connect(MQTT_HOST, settings);
mqtt_client.on('connect', () => {
  mqtt_client.subscribe('home/fish/temp');
  console.log('MQTT:', 'connected');
});

let temp1 = '';
let temp2 = '';
let temp3 = '';
let cooling = false;
let heating = false;
const GPIO_HEAT = 11;
const GPIO_COOLING = 9;
const PATH = '/sys/class/gpio';
let heatstart = 25.6;
let coolstart = 27.0;
let cooljump = 26.4;
let heatjump = 26.4;
let config;
let coolertime = 0;
let heattime = 0;
// Setup static server for current directory

// set the user's local credentials


function updatedata() {
  const promises = [
    temp.findOne({ 'Temprature.id': 'main' }, (err, temprature) => {
      if (err) { return; }

        // if no user is found, return the message
      if (!temprature) { return; }


      heatstart = parseFloat(temprature.Temprature.heatstart);
      heatjump = parseFloat(temprature.Temprature.heatjump);
      coolstart = parseFloat(temprature.Temprature.coolstart);
      cooljump = parseFloat(temprature.Temprature.cooljump);

      console.log(`${heatstart}:` + `:${heatjump}:${coolstart}:${cooljump}`);
    }).exec(),
  ];
}
function savedata(data, sensor) {
  const promises = [

    temp.findOne({ 'Temprature.id': 'main' }, (err, temprature) => {
      if (err) {
        console.log(err);
        return;
      }


        // if no user is found, return the message
      if (!temprature) { return; }

      console.log('found db');
      switch (sensor) {
        case 'coolstart':
          temprature.Temprature.coolstart = data;
          break;
        case 'cooljump':
          temprature.Temprature.cooljump = data;
          break;
        case 'heatstart':
          temprature.Temprature.heatstart = data;
          break;
        case 'heatjump':
          temprature.Temprature.heatjump = data;
          break;
      }

        // save
      temprature.save((err) => {
        if (err) { throw err; }
        updatedata();
      });
    }).exec(),
  ];
}

mqtt_client.on('message', (topic, message) => {
  console.log(`MQTT:${topic}:${message.toString()}`);
  if (topic === 'home/fish/temp') {
    const data = message.toString();
    const arr = data.split(',');
    if (arr[0] === 'Set') { savedata(arr[2], arr[1]); }
  }
});
function writepin(pin, value) {
    // fs.writeFile(PATH + '/gpio' + pin + '/value', value,function(err)
  fs.writeFile(`${PATH}/gpio${pin}/direction`, value, (err) => {
    if (err) {
      mqtt_client.publish('home', `Error-Temprature GPIO PIN WRITE ERROR-${err}`);
      const now = new Date().getTime();
      error += `Write Pin Error ${pin} ${now}`;
      return;
    }
    if (pin === GPIO_HEAT) {
      if (value === 'in' && heating) {
        heating = false;
        mqtt_client.publish('home', 'Temprature-heating Stoped');
      }
    }
    if (pin === GPIO_COOLING) {
      if (value === 'in' && cooling) {
        cooling = false;
        mqtt_client.publish('home', 'Temprature-Cooling Stoped');
      }
    }
  });
}
function exportPin(pin) {
  fs.writeFile(`${PATH}/export`, pin, (err) => {
    console.error(err);
  });

  fs.writeFile(`${PATH}/gpio${pin}/direction`, 'in', (err) => {
    console.error(err);
  });
}
// Setup database connection for logging
// Read current temperature from sensor
setInterval(() => {
  const now = new Date().getTime();
  fs.readFile('/sys/bus/w1/devices/28-0000077c030b/w1_slave', (err, buffer) => {
    if (err) {
      console.error(err);
      error += `Temp read error Sump  ${now}`;
      process.exit(1);
      mqtt_client.publish('home', `Error-Temprature Read Sump-${err}`);
    }

        // Read data from file (using fast node ASCII encoding).
    const data = buffer.toString('ascii').split(' '); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
    temp1 = parseFloat(data[data.length - 1].split('=')[1]) / 1000.0;

        // Round to one decimal place
    temp1 = Math.round(temp1 * 10) / 10;
    mqtt_client.publish('home', `Temprature-Sump-${temp1.toString()}`);
  });
  fs.readFile('/sys/bus/w1/devices/28-041658a940ff/w1_slave', (err, buffer) => {
    if (err) {
      console.error(err);
      process.exit(1);
      error += `Temp read error Tank  ${now}`;
      mqtt_client.publish('home', `Error-Temprature Read Tank-${err}`);
    }

        // Read data from file (using fast node ASCII encoding).
    const data = buffer.toString('ascii').split(' '); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
    temp2 = parseFloat(data[data.length - 1].split('=')[1]) / 1000.0;

        // Round to one decimal place
    temp2 = Math.round(temp2 * 10) / 10;
    mqtt_client.publish('home', `Temprature-Tank-${temp2}`);
  });
  fs.readFile('/sys/bus/w1/devices/28-041658bf36ff/w1_slave', (err, buffer) => {
    if (err) {
      console.error(err);
      process.exit(1);
      error += `Temp read error Room  ${now}`;
      mqtt_client.publish('home', `Error-Temprature Read Room-${err}`);
    }

        // Read data from file (using fast node ASCII encoding).
    const data = buffer.toString('ascii').split(' '); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
    temp3 = parseFloat(data[data.length - 1].split('=')[1]) / 1000.0;

        // Round to one decimal place
    temp3 = Math.round(temp3 * 10) / 10;
    mqtt_client.publish('home', `Temprature-Room-${temp3}`);
  });
  check();
}, 60000);

function check() {
  const temp1it = parseFloat(temp1);
  const temp2it = parseFloat(temp2);
  const callback = '';
  console.log(`floatval1=${temp1it.toString()}`);
  console.log(`floatval2=${temp2it.toString()}`);
  if (cooling) { coolertime++; }
  if (heating) { heattime++; }

  if (temp2it > coolstart) {
    if (temp1it > coolstart) {
      if (!cooling) {
        mqtt_client.publish('home', 'Temprature-cooling started');
      }
      console.log('im cooling');
      cooling = true;
      writepin(GPIO_COOLING, 'out');
      setTimeout(() => {
        writepin(GPIO_HEAT, 'in');
      }, 5000);
    }
  } else if (temp2it < heatstart) {
    // onheater

    if (temp1it < heatstart) {
      if (!heating) {
        mqtt_client.publish('home', 'Temprature-Heating started');
      }
      heating = true;
      writepin(GPIO_HEAT, 'out');
      setTimeout(() => {
        writepin(GPIO_COOLING, 'in');
      }, 5000);
    }
  }

  if (cooling) {
    if (temp1it <= cooljump || temp2it <= cooljump) {
      // stopcooling
      if (temp1it > 0 && temp2it > 0) {
        writepin(GPIO_COOLING, 'in');
        errorLoged = 0;
      }
    }
  } else if (heating) {
    if (temp1it >= heatjump || temp2it >= heatjump) {
      // stopcooling
      if (temp1it < 50 && temp2it < 50) {
        writepin(GPIO_HEAT, 'in');
        errorLoged = 0;
      }
    }
  }

  if (temp1it <= 25.0 || temp2it <= 25.0) {
    // warning heating not working
    if (temp1it > 0 && temp2it > 0) {
      writepin(GPIO_COOLING, 'out');
      setTimeout(() => {
        writepin(GPIO_COOLING, 'in');
      }, 5000);
      if (errorLoged = 0) {
        error += `Temp too low and heater is set to on  ${now}`;
        mqtt_client.publish('home', `Temprature-Warninig Low-${temp1it.toString()}`);
        const mailOptions = {
          to: 'powerinside777@gmail.com',
          subject: 'Fish tank Temprature Error',
          text: `Temprature-Warninig Low-${temp1it.toString()}`,
        };
        smtpTransposendMail(mailOptions, (error, response) => {
          if (error) {
            console.log(error);
            res.end('error');
          } else {
            console.log(`Message sent: ${response.message}`);
            res.end('sent');
          }
        });
        errorLoged = 1;
      }
    }
  }
  if (temp1it >= 27.8 || temp2it >= 27.9) {
    if (!cooling) {
      if (temp1it < 50 && temp2it < 50) {
        writepin(GPIO_HEAT, 'out');
        setTimeout(() => {
          writepin(GPIO_HEAT, 'in');
        }, 5000);
        if (errorLoged = 0) {
          error += `temp too high cooler not working ${now}`;
          mqtt_client.publish('home', `Temprature-Warninig Hight-${temp1it.toString()}`);
          errorLoged = 1;
          const mailOptions = {
            to: 'powerinside777@gmail.com',
            subject: 'Fish tank Temprature Error',
            text: `Temprature-Warninig Hight-${temp1it.toString()}`,
          };
          smtpTransposendMail(mailOptions, (error, response) => {
            if (error) {
              console.log(error);
              res.end('error');
            } else {
              console.log(`Message sent: ${response.message}`);
              res.end('sent');
            }
          });
        }
      }
    }
  }
}

// Create a wrapper function which we'll use specifically for logging
sendtimerdata.dayOfWeek = [0, new schedule.Range(0, 6)];
sendtimerdata.hour = 22;
sendtimerdata.minute = 33;
const data = schedule.scheduleJob(sendtimerdata, () => {
  mqtt_client.publish('home', `Temprature-Cooler runtime ${stopwatch.elapsed.minutes}`);
  mqtt_client.publish('home', `Temprature-Heater runtime ${stopwatch1.elapsed.minutes}`);

  const mailOptions = {
    to: 'powerinside777@gmail.com',
    subject: 'Fish tank Temprature Report',
    text: `Current temprature is ${temp1}\r\n` + ` Current Cooler runtime is ${coolertime} mins \r\n` + `Current Heater runtime is ${
      heattime}mins \r\n` + `errors are \r\n${error}`,
  };
  smtpTransposendMail(mailOptions, (error, response) => {
    if (error) {
      console.log(error);
      res.end('error');
    } else {
      console.log(`Message sent: ${response.message}`);
      res.end('sent');
    }
  });
  error = '';
  heattime = 0;
  coolertime = 0;
});

