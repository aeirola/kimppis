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
    Stand.find({}, function(err, docs) {
        callback({thing: "thing", docs: docs});
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
        name    : String,
        coord   : String
    });

    mongoose.model('Stand', Stand);
    
    // Get some tolppa
    var Stand = mongoose.model('Stand');
    // Drop old
    Stand.collection.drop(function() {});
    
    // Add new
    new Stand({name: "Stand 1"}).save();
    new Stand({name: "Stand 2"}).save();
    new Stand({name: "Stand 3"}).save();
}

init = function() {
    // Init DB
    init_database();
}

// Init stuff
init();

console.log(util.format('%s running at %s:%s/', settings.name, settings.http.host, settings.http.port));
