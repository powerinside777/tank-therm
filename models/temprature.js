
var mongoose = require('mongoose');

// define the schema for our user model

var fishtanktemp = mongoose.Schema({

    Temprature           : {
        id              : String,
        heatstart        : String,
        heatjump        : String,
        coolstart        : String,
        cooljump     : String
    }

});


module.exports = mongoose.model('Temp',fishtanktemp);
