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
	console.log("get_stands()");
    var Stand = mongoose.model('Stand');
    Stand.find({}, function(err, stands) {
        callback({stands: stands});
    });
}

taksi.add_request = function(callback, request) {
	// request = {position: [long, lat], destination: [long, lat], places: num}
	console.log("add_request("+ request +")");
	
    var Request = mongoose.model('Request');
	
	// Get routes from stand where point near destination
	var query = Request.find({});
	query.where('route.stand', request.stand_id);
	query.where('route.completed', false);
	query.$gte('route.places', request.places);
	query.near('position', request.to);
	query.populate('route.requests');
	
	query.findOne(function (err, closest_request) {
		if (!closest_request) {
			taksi.create_route(callback, request);
			return;
		}
		
		var route = closest_request.route;
		
		// TODO: Check if feasible at all!
		
		// Store request in database
		var new_request = new Request(request);
		new_request.route = route.id;
		new_request.save();
		
		// Notify other requests
		// TODO!
		
		// Return route and request id
		route.places -= request.places;
		route.save();
		callback(route);
	});
};

taksi.create_route = function(callback, incoming_request) {
    var Request = mongoose.model('Request');
    var Route = mongoose.model('Route');
	
	var route = new Route();
	route.places = settings.places - request.places;
	route.save();
	
	var request = new Request(incoming_request);
	request.route = route.id
	request.save();
	
	route.requests = [request];
	
	callback(route);
};

taksi.remove_request = function(request_id) {
	console.log("remove_request("+ request_id +")");
	
	var Request = mongoose.model('Request');
	Request.findById(request_id).populate('route').run(function (err, request) {
		var route = request.route;
		route.places -= request.places;
		route.save();
		
		Request.remove({id: request_id});
	});
}

taksi.get_request = function(callback, request_id) {
	console.log("get_request("+ request_id +")");
	
    var Request = mongoose.model('Request');
	
	Request.findById(request_id).populate('route').populate('route.requests').run(function (err, request) {
		callback(request);
	});
}

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
    this.get(/^stands$/).bind(function (req, res) {
        taksi.get_stands(function (ret) {res.send(ret);})
    });
	
	// Get route information (for polling)
    this.get(/^route\/([A-Za-z0-9_]+)$/).bind(function (req, res, route_id) {
        taksi.get_stand_routes(function (ret) {res.send(ret);}, route_id);
    });
    
    /**
    * _POST
    */
	
    // Add request
    this.post(/^request$/).bind(function (req, res, request) {
        taksi.add_request(function (ret) {res.send(ret);}, request);
    });
	
    /**
    * _DELETE
    */
	
    // Remove request
    this.del(/^requests$/).bind(function (req, res, request_id) {
        taksi.remove_request(function (ret) {res.send(ret);}, request_id);
    });
});

// Create server based on router
init_http = function () {
	http.createServer(function (request, response) {
		var uri = url.parse(request.url).pathname
		var filename = path.join(process.cwd(), uri);
		
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
			} else {
				// Serve static content
				console.log("routing")
			    var body = "";
					console.log("request");
					console.log(request);
					router.handle(request, body, function (result) {
						console.log("result");
						console.log(result);
			            response.writeHead(result.status, result.headers);
			            response.end(result.body);
			        });
			}
		});
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
        route    	: {type: ObjectId, index: true, ref: 'Route', required: true},
		places		: {type: Number, default: 4},
		date		: {type: Date, default: new Date()},
		destination	: [Number]
    });
	Request.index({
  		destination: '2d'
	});
    mongoose.model('Request', Request);
	
    var Route = new Schema({
        stand    	: {type: ObjectId, index: true, ref: 'Stand'},
		date		: {type: Date, default: new Date()},
		places		: Number,
		completed	: {type: Boolean, default: false},
		requests	: {type: [ObjectId], ref: 'Request'}
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
	// Init Http
	init_http();
}

// Init stuff
init();

console.log(util.format('%s running at %s:%s/', settings.name, settings.http.host, settings.http.port));
