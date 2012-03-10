// HTTP
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var journey = require('journey');

// DB
var mongoose = require('mongoose');

// Utils
var util = require('util');

// Options
var settings = {
    name: 'kimppis',
    http: {
        host: 'localhost',
        port: 8080
    },
    db: {
        database: 'kimppis',
        host: 'localhost',
        port: 27017
    }
}

taksi = {}

// Application code
taksi.get_stands = function(callback) {
    var Stand = mongoose.model('Stand');
    Stand.find({}, function(err, stands) {
        callback({stands: stands});
    });
}

taksi.get_stand = function(stand_name) {
    res = {
        'name': util.format('Hello stand: %s', stand_name)
    };

    return res;
}

taksi.add_route = function(route) {
    res = {
        'name': util.format('Hello route: %s', route)
    };
    
    return res;
}

taksi.default_response = function() {
    res = {
        'message': 'These are not the bits you are looking for!'
    };

    return res;
}

// Deifne router
// Examples https://github.com/bogomil/Node.JS-examples/blob/master/httpsrestserver/routerit.js
var mrouter = new (journey.Router)();
mrouter.map(function () {
    /**
    * Say Welcome to the user or dispay eany other info
    */
    this.root.bind(function (req, res) { res.send(util.format("Welcome to %s", settings.name)) });

    /**
    * Hanlde _GET
    */

    // Just /tolpat
    this.get('/stand').bind(function (req, res) {
        taksi.get_stands(function (ret) {res.send(ret);})
    });


    // tolpat/TOLPPA_NAME
    this.get(/^stand\/([A-Za-z0-9_]+)$/).bind(function (req, res, id) {
        taksi.get_stand(function (ret) {res.send(ret);}, id);
    });
    
    /**
    * _POST
    */

    // create database
    this.post('/route/add').bind(function (req, res, route) {
        taksi.add_route(function (ret) {res.send(ret);}, route);
    });
});

// Create server based on router
http.createServer(function (request, response) {
    var body = "";

    request.addListener('data', function (chunk) { body += chunk });
    request.addListener('end', function () {
        mrouter.handle(request, body, function (result) {
            response.writeHead(result.status, result.headers);
            response.end(result.body);
        });
    });

}).listen(settings.http.port, settings.http.host);

init_database = function() {
    mongoose.connect('mongodb://localhost/kimppis');
    
    // Define schemas
    var Schema = mongoose.Schema
      , ObjectId = Schema.ObjectId;

    var Stand = new Schema({
        name    	: {type: String, index: true, unique: true},
        position	: [Number]
    });
	Stand.index({
  		position: '2d'
	})
    mongoose.model('Stand', Stand);
	
    var Request = new Schema({
        route    	: {type: ObjectId, index: true},
		places		: {type: Number, default: 4},
		date		: Date,
		destination	: [Number]
    });
	Request.index({
  		destination: '2d'
	})
    mongoose.model('Request', Request);
	
    var Route = new Schema({
        stand    	: ObjectId,
		date		: Date,
		places		: Number,
		completed	: Boolean
    });
    mongoose.model('Route', Route);
    
    // Get models
    var Stand = mongoose.model('Stand');
    var Request = mongoose.model('Request');
    var Route = mongoose.model('Route');
    // Drop old data
    Stand.collection.drop(function() {});
    Request.collection.drop(function() {});
    Route.collection.drop(function() {});
    
    // Add some stops
    var otaniemi = new Stand({name: "Otaniemi", position: [24.8332,60.184753]});
	otaniemi.save();
    var rautatientori = new Stand({name: "Rautatientori", position: [24.942763,60.171595]});
	rautatientori.save();
    var eliel = new Stand({name: "Elieli", position: [24.939909,60.170806]});
	eliel.save();
	
	// Add some routes
	var ota_route = new Route({stand: otaniemi._id, date: new Date(), places: 4, completed: false});
	ota_route.save();
	var rauta_route1 = new Route({stand: rautatientori._id, date: new Date(), places: 4, completed: false});
	rauta_route1.save();
	var rauta_route2 = new Route({stand: rautatientori._id, date: new Date(), places: 4, completed: false});
	rauta_route2.save();
	var eli_route = new Route({stand: eliel._id, date: new Date(), places: 4, completed: false});
	eli_route.save();
	
	// Add some requests
    new Request({route: ota_route._id, places: 2, date: new Date(), destination: [60,24]}).save();
    new Request({route: rauta_route1._id, places: 2, date: new Date(), destination: [60,24]}).save();
    new Request({route: rauta_route2._id, places: 2, date: new Date(), destination: [60,24]}).save();
    new Request({route: eli_route._id, places: 2, date: new Date(), destination: [60,24]}).save();
}

init = function() {
    // Init DB
    init_database();
}

// Init stuff
init();

console.log(util.format('%s running at %s:%s/', settings.name, settings.http.host, settings.http.port));
