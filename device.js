var mqtt    = require('mqtt');
var DEVICE = process.env.DEVICE_IP;
var ID =  process.env.DEVICE_ID
var PORT = process.env.DEVICE_PORT;
var DRIVER =   process.env.DRIVER_NAME
var MQTT_HOST = process.env.MQTT_BROKER;
var mqtt_client  = mqtt.connect();
var DISPLAY = require('./lib');
var Commands = require("./drivers/"+DRIVER+".json");
exports.Commands = Commands;

mqtt_client.on('connect', function () {
    mqtt_client.subscribe('room/display/'+ID+'/power');
});


var display = new DISPLAY.Displayclass(DEVICE,PORT,Commands, function(client) {

    client.request();


    mqtt_client.on('message', function (topic, message) {
        console.log('MQTT:'+topic+':'+message.toString());
        if(topic == 'room/display/'+ID+'/power'){
            
            if(message.toString() == 'on'){
                client.exec(Commands.CMD_ON)
            }
            else if(message.toString() == 'off') {
                client.exec(Commands.CMD_OFF)
            }
            else if(message.toString() == 'hdmi1') {
                client.exec(Commands.CMD_HDMI1)
            }
            else if(message.toString() == 'hdmi2') {
                client.exec(Commands.CMD_HDMI2)
            }
            else if(message.toString() == 'hdmi3') {
                client.exec(Commands.CMD_HDMI3)
            }
            else if(message.toString() == 'hdmi4') {
                client.exec(Commands.CMD_HDMI4)
            }
        }
    });
});