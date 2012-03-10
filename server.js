// HTTP
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var journey = require('journey');

var path = require("path");
var fs = require("fs");

// DB
var mongoose = require('mongoose');

// Utils
var util = require('util');

// Options
var settings = {
    name: 'kimppis',
	places: 4,
    http: {
        host: '0.0.0.0',
        port: 8080
    },
    db: {
        database: 'kimppis',
        host: 'localhost',
        port: 27017
    }
}

taksi = {}

// WTF??
var json = null;

// Application code
taksi.get_stands = function(callback) {
	console.log("get_stands()");
    var Stand = mongoose.model('Stand');
    Stand.find({}, function(err, stands) {
        callback({stands: stands});
    });
}

taksi.add_request = function(callback, incoming_request) {
	// request = {origin: [long, lat], destination: [long, lat], persons: num, address: str}
    var Request = mongoose.model('Request');
    var Route = mongoose.model('Route');
	var Stand = mongoose.model('Stand');
	
	var query = Stand.find({});
	query.near('position', incoming_request.origin);
	query.findOne(function (err, closest_stand) {
		if (!closest_stand) {
			console.log("No stand found!");
			return;
		}
		
		// Get routes from stand where point near destination
		var query = Request.find({});
		query.where('stand', closest_stand.id);
		query.where('completed', false);
		query.gte('places', incoming_request.persons);
		query.near('destination', incoming_request.destination);
		
		query.findOne(function (err, closest_request) {
			if (err) {
				console.log(err, err.message);
				return;
			}
			
			var route;
			
			// TODO: Check if feasible at all!
			if (!closest_request) {
				// Create route
				route = new Route();
				route.stand = closest_stand.id;
				route.save(function () {
					taksi.add_request_to_route(incoming_request, route, callback);
				});
			} else {
				taksi.get_route(closest_request.route, function(route) {
					taksi.add_request_to_route(incoming_request, route, callback);
				});
			}
		});
	});
};

taksi.add_request_to_route = function(incoming_request, route, callback) {
    var Request = mongoose.model('Request');
    var Route = mongoose.model('Route');

	// Create request
	var request = new Request(incoming_request);
	request.route = route.id;
	request.stand = route.stand;
	request.save(function () {
		// Return route and request id
		route.places -= request.persons;
		route.requests = route.requests || []
		route.requests.push(request.id);
		route.save(function () {
			// Return the created request
			taksi.get_route_data(request.id, route.id, callback);
		});
	});
}

taksi.remove_request = function(request_id) {
	console.log("remove_request("+ request_id +")");
	
	var Request = mongoose.model('Request');
	Request.findById(request_id).run(function (err, request) {
		var route = request.route;
		route.places -= request.places;
		route.requests.
		route.save(function() {
			Request.remove({id: request_id});
		});
	});
}

taksi.get_route_data = function(request_id, route_id, callback) {
	var Request = mongoose.model('Request');
	taksi.get_request(request_id, function (request) {
		taksi.get_route(route_id, function (route) {
			Request.find({route: route_id}, function (err, requests) {
				callback({request: request, route: route, requests: requests});
			});
		});
	});
};

taksi.get_request = function(request_id, callback) {
	console.log("get_request("+ request_id +")");
	
    var Request = mongoose.model('Request');
	var query = Request.findById(request_id);
	//query.populate('route');
	query.populate('stand');
	query.run(function (err, request) {
		callback(request);
	});
};

taksi.get_route = function(route_id, callback) {
    var Route = mongoose.model('Route');
	var query = Route.findById(route_id);
	//query.populate('requests');
	query.populate('stand')
	query.run(function(err, route){
		callback(route);
	});
};

taksi.get_stand = function(stand_id, callback) {
    var Stand = mongoose.model('Stand');
	Stand.findById(stand_id, function(err, stand) {
		callback(stand);
	});
};

// Deifne router
// Examples https://github.com/bogomil/Node.JS-examples/blob/master/httpsrestserver/routerit.js
var router = new (journey.Router)();
router.map(function () {
    /**
    * Say Welcome to the user or dispay eany other info
    */
    this.root.bind(function (req, res) { res.send(util.format("Welcome to %s", settings.name)) });

    /**
    * Hanlde _GET
    */

    // Get all stands
    this.get('/stands').bind(function (req, res) {
        taksi.get_stands(function (ret) {res.send(ret);})
    });
	
	// Get route information (for polling)
    this.get(/^route\/([a-z0-9_]+)$/).bind(function (req, res, route_id) {
        taksi.get_stand_routes(function (ret) {res.send(ret);}, route_id);
    });
    
    /**
    * _PUT
    */
	
    // Add request
    this.put('/request').bind(function (req, res, data) {
        taksi.add_request(function (ret) {res.send(ret);}, req.json);
    });
	
    /**
    * _DELETE
    */
	
    // Remove request
    this.del('/requests').bind(function (req, res, request_id) {
        taksi.remove_request(function (ret) {res.send(ret);}, request_id);
    });
});

// Create server based on router
init_http = function () {
	http.createServer(function (request, response) {
		var uri = url.parse(request.url).pathname
		var filename = path.join(process.cwd(), uri);
		
		if (request.url.match("/public/.*")) {	
			path.exists(filename, function(exists) {
				// Serve static content
				if(exists) {
					if (fs.statSync(filename).isDirectory()) filename += '/index.html';
					fs.readFile(filename, "binary", function(err, file) {
						if(err) {
							response.writeHead(500, {"Content-Type": "text/plain"});
							response.write(err + "\n");
							response.end();
							return;
						}
						
						response.writeHead(200);
						response.write(file, "binary");
						response.end();
					});
				}
			});
		} else {
			// Serve dynamic content
			var body = "";
			request.addListener('data', function (chunk) { body += chunk });
			request.addListener('end', function () {
				// Da fuqq?
				if (body) {
					request.json = JSON.parse(body);
				}
				router.handle(request, body, function (result) {
					response.writeHead(result.status, result.headers);
					response.end(result.body);
				});
			});
		}
	}).listen(settings.http.port, settings.http.host);
}

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
	});
    mongoose.model('Stand', Stand);
	
    var Request = new Schema({
        stand    	: {type: ObjectId, index: true, ref: 'Stand', required: true},
        route    	: {type: ObjectId, index: true, ref: 'Route', required: true},
		persons		: {type: Number, default: 4},
		date		: {type: Date, default: Date.now},
		completed	: {type: Boolean, default: false},
		places		: {type: Number, default: 4},
		destination	: [{type: Number}],
		destination_string : {type: String, default: "Unkown"}
    });
	Request.index({
  		destination: '2d'
	});
    mongoose.model('Request', Request);
	
    var Route = new Schema({
        stand    	: {type: ObjectId, index: true, ref: 'Stand'},
		date		: {type: Date, default: Date.now},
		places		: Number,
		requests	: [],
		completed	: {type: Boolean, default: false}
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
	var ota_route = new Route({stand: otaniemi.id, places: 4, completed: false});
	ota_route.save();
	var rauta_route1 = new Route({stand: rautatientori.id, places: 4, completed: false});
	rauta_route1.save();
	var rauta_route2 = new Route({stand: rautatientori.id, places: 4, completed: false});
	rauta_route2.save();
	var eli_route = new Route({stand: eliel.id, places: 4, completed: false});
	eli_route.save();
	
	// Add some requests
    new Request({route: ota_route.id, stand: otaniemi.id, persons: 1, destination: [60,24]}).save();
    new Request({route: rauta_route1.id, stand: rauta_route1.id, persons: 1, destination: [60,24]}).save();
    new Request({route: rauta_route2.id, stand: rauta_route2.id, persons: 2, destination: [60,24]}).save();
    new Request({route: eli_route.id, stand: eli_route.id, persons: 1, destination: [60,24]}).save();
}

init = function() {
    // Init DB
    init_database();
	// Init Http
	init_http();
}

// Init stuff
init();

console.log(util.format('%s running at %s:%s/', settings.name, settings.http.host, settings.http.port));
