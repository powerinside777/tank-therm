// Load node modules

var schedule = require('node-schedule');
var fs = require('fs');
var sys = require('sys');
var http = require('http');
var TMClient = require('textmagic-rest-client');
var nodemailer = require("nodemailer");
var path = require('path');
var mqtt    = require('mqtt');
var DEVICE = "10.0.0.158"
var MQTT_HOST = "mqtt://10.0.0.61:1883";
var MQTT_BROKER_USER = 'josh';
var MQTT_BROKER_PASS = 'Isabella2030';
var mongoose = require('mongoose');
var configDB = require('./models/database.js');
var db = mongoose.connection;
mongoose.Promise = require('q').Promise
var temp       		= require('./models/temprature.js');
var lastReconnectAttempt;
var error =""
var ncurrentcoolerrunftime;
var sendtimerdata = new schedule.RecurrenceRule();
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
    error += "MongoDB disconnected!" + now;
    setTimeout(function() {
        var now = new Date().getTime();
        // check if the last reconnection attempt was too early
        if (lastReconnectAttempt && now - lastReconnectAttempt < 5000) {
            // if it does, delay the next attempt
            var delay = 5000 - (now - lastReconnectAttempt);
            console.log('reconnecting to MongoDB in ' + delay + "mills");
            setTimeout(function () {
                console.log('reconnecting to MongoDB');
                lastReconnectAttempt = new Date().getTime();
                mongoose.connect(configDB.url, {server: {auto_reconnect: true}});
            }, delay);
        }
        else {
            console.log('reconnecting to MongoDB');
            lastReconnectAttempt = now;
            mongoose.connect(configDB.url, {server: {auto_reconnect: true}});
        }
    },900000)
});
db.on('connected', function() {
    updatedata()
    console.log("coonected to db")
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
var heatstart =25.6
var coolstart =27.0
var cooljump =26.4
var heatjump =26.4
var config;
var coolertime = 0
var heattime = 0
// Setup static server for current directory
exportPin(9);
exportPin(11);
writepin(GPIO_HEAT,'in');
writepin(GPIO_COOLING,'in');

// set the user's local credentials


function updatedata(){
    var promises = [
    temp.findOne({ 'Temprature.id' :  'main' }, function(err, temprature) {
        if (err)
            return;

        // if no user is found, return the message
        if (!temprature)
            return;


        heatstart =  parseFloat(temprature.Temprature.heatstart)
        heatjump =  parseFloat(temprature.Temprature.heatjump)
        coolstart =  parseFloat(temprature.Temprature.coolstart)
        cooljump = parseFloat( temprature.Temprature.cooljump)

        console.log(heatstart+":"+":"+heatjump+":"+coolstart+":"+cooljump)

    }).exec()
        ];

}
function savedata(data,sensor){
    var promises = [

    temp.findOne({ 'Temprature.id' :'main'}, function(err, temprature) {
        if (err){
            console.log(err)
            return;
        }


        // if no user is found, return the message
        if (!temprature)
            return;

        console.log("found db")
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
    }).exec()
    ];
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
    fs.writeFile(PATH+'/gpio'+ pin + '/direction',value,function(err) {
        if (err) {
            mqtt_client.publish("home", "Error-Temprature GPIO PIN WRITE ERROR-" + err);
            var now = new Date().getTime();
            error += "Write Pin Error "+pin+" " + now
            return;
        }
        if(pin  == GPIO_HEAT) {
            if (value == 'in' && heating)
            {
                heating = false;
                mqtt_client.publish("home", "Temprature-heating Stoped");

            }
        }
        if(pin  == GPIO_COOLING) {
            if (value == 'in' && cooling)
            {
                cooling = false;
                mqtt_client.publish("home", "Temprature-Cooling Stoped");


            }
        }


    });
}
function exportPin(pin) {
    fs.writeFile(PATH + '/export', pin, function(err) {
        console.error(err);
    });

    fs.writeFile(PATH+'/gpio'+ pin + '/direction','in',function(err)
    {
        console.error(err);
    });

}
// Setup database connection for logging
// Read current temperature from sensor
setInterval(function(){
    var now = new Date().getTime();
    fs.readFile('/sys/bus/w1/devices/28-0000077c030b/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            error += "Temp read error Sump  " +now
            process.exit(1);
            mqtt_client.publish("home", "Error-Temprature Read Sump-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp1  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp1 = Math.round(temp1 * 10) / 10;
        mqtt_client.publish("home", "Temprature-Sump-"+temp1.toString());

    });
    fs.readFile('/sys/bus/w1/devices/28-041658a940ff/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            process.exit(1);
            error += "Temp read error Tank  " + now
            mqtt_client.publish("home", "Error-Temprature Read Tank-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp2  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp2 = Math.round(temp2 * 10) / 10;
        mqtt_client.publish("home", "Temprature-Tank-"+temp2);
    });
    fs.readFile('/sys/bus/w1/devices/28-041658bf36ff/w1_slave', function(err, buffer)
    {
        if (err){
            console.error(err);
            process.exit(1);
            error += "Temp read error Room  " +now
            mqtt_client.publish("home", "Error-Temprature Read Room-"+err);
        }

        // Read data from file (using fast node ASCII encoding).
        var data = buffer.toString('ascii').split(" "); // Split by space

        // Extract temperature from string and divide by 1000 to give celsius
        temp3  = parseFloat(data[data.length-1].split("=")[1])/1000.0;

        // Round to one decimal place
        temp3 = Math.round(temp3 * 10) / 10;
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
if(cooling)
    coolertime ++

if(heating)
    heattime ++


    if(temp2it >coolstart){
//oncooler
        if(temp1it > coolstart){
            if(!cooling) {
                mqtt_client.publish("home", "Temprature-cooling started");

            }
            console.log('im cooling')
            cooling = true;
            writepin(GPIO_COOLING,'out');
            setTimeout(function() {
            writepin(GPIO_HEAT,'in');
            },5000)

        }
    }
    else if (temp2it <heatstart){
        //onheater

        if (temp1it <heatstart){
            if(!heating) {
                mqtt_client.publish("home", "Temprature-Heating started");
                stopwatch1.start();
            }
            heating = true;
            writepin(GPIO_HEAT,'out');
            setTimeout(function() {
                writepin(GPIO_COOLING, 'in');
            },5000)


        }

    }

    if(cooling){
        if(temp1it <= cooljump || temp2it <= cooljump ){
            //stopcooling
            if(temp1it > 0 && temp2it > 0 ) {

               writepin(GPIO_COOLING, 'in');

            }
        }
    }

    if(heating) {
        if (temp1it >= heatjump || temp2it >= heatjump) {
            //stopcooling
            if (temp1it < 50 && temp2it < 50) {
                writepin(GPIO_HEAT, 'in');

            }
        }
    }

    if(temp1it <= 25.0 || temp2it <=25.0 ){
        //warning heating not working
        if(temp1it > 0 && temp2it > 0 ) {
            sendtext("Temp too low and heater is set to on");
            error += "Temp too low and heater is set to on  " + now
            mqtt_client.publish("home", "Temprature-Warninig Low-" + temp1it.toString());
            if(cooling){
                writepin(GPIO_COOLING, 'in');
            }
        }
    }
    if(temp1it >= 27.8 || temp2it >= 27.9)
    {

         if(!cooling) {
             if (temp1it < 50 && temp2it < 50) {
                 sendtext("temp too high cooler not working");
                 error += "temp too high cooler not working " + now
                 mqtt_client.publish("home", "Temprature-Warninig Hight-" + temp1it.toString());
             }
         }
    }
}
var smtpTransport = nodemailer.createTransport("SMTP",{
    service: "Gmail",
    auth: {
        user: "powerinside777@gmail.com",
        pass: "myjesus0101"
    }
});
// Create a wrapper function which we'll use specifically for logging
sendtimerdata.dayOfWeek = [0, new schedule.Range(0, 6)];
sendtimerdata.hour =22
sendtimerdata.minute =33
var data = schedule.scheduleJob(sendtimerdata, function(){
    mqtt_client.publish("home", "Temprature-Cooler runtime " +  stopwatch.elapsed.minutes);
    mqtt_client.publish("home", "Temprature-Heater runtime " +  stopwatch1.elapsed.minutes);



    var mailOptions={
        to : "powerinside777@gmail.com",
        subject : 'Fish tank Temprature Report',
        text : "Current temprature is "+temp1 +'\r\n'+" Current Cooler runtime is "+ coolertime+' mins \r\n'+"Current Heater runtime is "+
        heattime+"mins \r\n"+ "errors are \r\n"+error
    }
    smtpTransport.sendMail(mailOptions, function(error, response){
        if(error){
            console.log(error);
            res.end("error");
        }else{
            console.log("Message sent: " + response.message);
            res.end("sent");
        }
    });
    error = '';
    heattime  = 0
    coolertime = 0
});

