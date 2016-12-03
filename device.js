// Load node modules
var fs = require('fs');
var sys = require('sys');
var http = require('http');
var TMClient = require('textmagic-rest-client');
var path = require('path');
var mqtt    = require('mqtt');
var DEVICE = "10.0.0.158"
var MQTT_HOST = "mqtt://10.0.0.57:1883";
var MQTT_BROKER_USER = 'josh';
var MQTT_BROKER_PASS = 'Isabella2030';
var mongoose = require('mongoose');
var configDB = require('./models/database.js');
var db = mongoose.connection;
var temp       		= require('./models/temprature');
var lastReconnectAttempt;
var settings = {
    username:MQTT_BROKER_USER,
    password:MQTT_BROKER_PASS
}
mongoose.connect(configDB.url,{server:{auto_reconnect:true}},function(err) {
    if (err)
        return console.error(err);

}); // connect to our database
db.on('error', function(error) {
    console.error('Error in MongoDb connection: ' + error);
    mongoose.disconnect();
});
db.on('disconnected', function() {
    console.log('MongoDB disconnected!');
    var now = new Date().getTime();
    // check if the last reconnection attempt was too early
    if (lastReconnectAttempt && now-lastReconnectAttempt<5000) {
        // if it does, delay the next attempt
        var delay = 5000-(now-lastReconnectAttempt);
        console.log('reconnecting to MongoDB in ' + delay + "mills");
        setTimeout(function() {
            console.log('reconnecting to MongoDB');
            lastReconnectAttempt=new Date().getTime();
            mongoose.connect(configDB.url, {server:{auto_reconnect:true}});
        },delay);
    }
    else {
        console.log('reconnecting to MongoDB');
        lastReconnectAttempt=now;
        mongoose.connect(configDB.url, {server:{auto_reconnect:true}});
    }

});
db.on('connected', function() {
    updatedata()

});
var mqtt_client  = mqtt.connect(MQTT_HOST,settings);
mqtt_client.on('connect', function () {
    mqtt_client.subscribe('home/fish/temp');
    console.log('MQTT:','connected');
});

var temp1 ="";
var temp2 ="";
var temp3 ="";
var cooling =false;
var heating = false;
var GPIO_HEAT = 11;
var GPIO_COOLING = 9;
var PATH = '/sys/class/gpio';
var heatstart ="25.9";
var coolstart ="27.0";
var cooljump ="26";
var heatjump ="26.4";
var config;
// Setup static server for current directory
exportPin(9);
exportPin(11);
writepin(GPIO_HEAT,'in');
writepin(GPIO_COOLING,'in');

function updatedata(){
    temp.findOne({ 'Temprature.id' :  'main' }, function(err, temprature) {
        if (err)
            return;

        // if no user is found, return the message
        if (!temprature)
            return;


        heatstart =  temprature.Temprature.heatstart;
        heatjump =  temprature.Temprature.heatjump
        coolstart =  temprature.Temprature.coolstart
        cooljump =  temprature.Temprature.cooljump

    });

}
function savedata(data,sensor){

    temp.findOne({ 'Temprature.id' :  'main' }, function(err, temprature) {
        if (err)
            return;
        console.log("found db")
        // if no user is found, return the message
        if (!temprature)
            return;
        switch(sensor){
            case "coolstart":
                temprature.Temprature.coolstart = data;
                break;
            case "cooljump":
                temprature.Temprature.cooljump = data;
                break;
            case "heatstart":
                temprature.Temprature.heatstart = data;
                break;
            case "heatjump":
                temprature.Temprature.heatjump = data;
                break;
        }

        // save
        temprature.save(function (err) {
            if (err)
                throw err;
            updatedata();
            return;
        });
    });
}

mqtt_client.on('message', function (topic, message) {
    console.log('MQTT:'+topic+':'+message.toString());
    if(topic == 'home/fish/temp') {
        var data = message.toString();
        var arr = data.split(",");
        if(arr[0] == 'Set')
            savedata(arr[2],arr[1])

    }

});
function writepin(pin,value){
    // fs.writeFile(PATH + '/gpio' + pin + '/value', value,function(err)
    fs.writeFile(PATH+'/gpio'+ pin + '/value',value,function(err)
    {
        console.error(err);
        mqtt_client.publish("home", "Error-Temprature GPIO PIN WRITE ERROR-"+err);
    });

}
function exportPin(pin) {
    fs.writeFile(PATH + '/export', pin, function(err) {
        console.error(err);
    });

    fs.writeFile(PATH+'/gpio'+ pin + '/direction','out',function(err)
    {
        console.error(err);
    });

}
// Setup database connection for logging
// Read current temperature from sensor
setInterval(function(){
    fs.readFile('/sys/bus/w1/devices/28-0000077c030b/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            process.exit(1);
            mqtt_client.publish("home", "Error-Temprature Read Tank-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp1  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp1 = Math.round(temp1 * 10) / 10;
        console.log("Temp1="+temp1)
        mqtt_client.publish("home", "Temprature-Tank-"+temp1);

    });
    fs.readFile('/sys/bus/w1/devices/28-041658a940ff/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            process.exit(1);
            mqtt_client.publish("home", "Error-Temprature Read Sump-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp2  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp2 = Math.round(temp2 * 10) / 10;
        mqtt_client.publish("home", "Temprature-Sump-"+temp2);
    });
    fs.readFile('/sys/bus/w1/devices/28-041658bf36ff/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            process.exit(1);
            mqtt_client.publish("home", "Error-Temprature Read Room-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp3  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp3 = Math.round(temp2 * 10) / 10;
        mqtt_client.publish("home", "Temprature-Room-"+temp3);
    });
    check();
},60000);
function sendtext(message){
    var c = new TMClient('joshuahodgetts', 'H92AOjzj6erMx6E8Hg7mVl4mnUR9WZ');
    c.Messages.send({text: message, phones:'61413320481'}, function(err, res){
        console.log('Messages.send()', err, res);
    });
}
function check(){
    var temp1it = parseFloat(temp1);
    var temp2it = parseFloat(temp2);
    var callback= "";
    console.log("floatval1="+temp1it.toString());
    console.log("floatval2="+temp2it.toString());

    if(temp2it >coolstart){
//oncooler
        if(temp1it >coolstart){
            cooling = true;
            writepin(GPIO_COOLING,'out');
            writepin(GPIO_HEAT,'in');
        }
    }
    else if (temp2it <heatstart){
        //onheater
        if (temp1it <heatstart){
            heating = true;
            writepin(GPIO_HEAT,'out');
            writepin(GPIO_COOLING,'in');
        }
    }
    if(cooling){
        if(temp1it <= cooljump || temp2it <= cooljump ){
            //stopcooling
            if(temp1it > 0 && temp2it > 0 ) {
                cooling = false;
                writepin(GPIO_COOLING, 'in');
            }
        }
    }
    if(heating) {
        if (temp1it >= heatjump || temp2it >= heatjump) {
            //stopcooling
            if (temp1it < 50 && temp2it < 50) {
                heating = false;
                writepin(GPIO_HEAT, 'in');
            }
        }
    }
    if(temp1it <= 25.0 || temp2it <=25.0 ){
        //warning heating not working
        if(temp1it > 0 && temp2it > 0 ) {
            sendtext("Temp too low and heater is set to on");
            mqtt_client.publish("home", "Temprature-Warninig Low-" + temp1it.toString());
        }
    }
    if(temp1it >= 27.8 || temp2it >= 27.9)
    {

         if(!cooling) {
             if (temp1it < 50 && temp2it < 50) {
                 sendtext("temp too high cooler not working");

                 mqtt_client.publish("home", "Temprature-Warninig Hight-" + temp1it.toString());
             }
         }
    }
}
// Create a wrapper function which we'll use specifically for logging

updatedata();
