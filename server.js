// HTTP
var http = require('http');
var url = require('url');
var querystring = require('querystring');
var journey = require('journey');

var path = require("path");
var fs = require("fs");

// DB
var mongoose = require('mongoose');

// Options
var settings = {
    name: 'kimppis',
	places: 4,
    http: {
        host: '0.0.0.0',
        port: 80
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
		query.where('destination').near(incoming_request.destination).maxDistance(2);
		
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
            // Update request places
            Request.update({ route: route.id }, {places: route.places}, { multi: true }, function () {
    			// Return the created request
    			taksi.get_route_data(request.id, route.id, callback);
            });
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
    this.root.bind(function (req, res) { res.send("Welcome to "+ settings.name) });

    /**
    * Hanlde _GET
    */

    // Get all stands
    this.get('/rest/stands').bind(function (req, res) {
        taksi.get_stands(function (ret) {res.send(ret);})
    });
	
	// Get route information (for polling)
    this.get(/^rest\/route\/([a-z0-9_]+)$/).bind(function (req, res, route_id) {
		taksi.get_route(route_id, function (route) {
			Request.find({route: route_id}, function (err, requests) {
				callback({route: route, requests: requests});
			});
		});
    });
    
    /**
    * _PUT
    */
	
    // Add request
    this.put('/rest/request').bind(function (req, res, data) {
        taksi.add_request(function (ret) {res.send(ret);}, req.json);
    });
	
    /**
    * _DELETE
    */
	
    // Remove request
    this.del('/rest/requests').bind(function (req, res, request_id) {
        taksi.remove_request(function (ret) {res.send(ret);}, request_id);
    });
});

// Create server based on router
init_http = function () {
	http.createServer(function (request, response) {
		var uri = url.parse(request.url).pathname
		var filename = path.join(process.cwd(), uri);

    	var ua = "kimppis";
        if (request && request.headers['user-agent']) {
            ua = request.headers['user-agent'].toLowerCase();
        }
        if(request.url === '/' && ua && !/android.+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(ua)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|e\-|e\/|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(di|rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|xda(\-|2|g)|yas\-|your|zeto|zte\-/i.test(ua.substr(0,4))) {
            response.writeHead(302, {Location: '/kimppis/'});
        	response.end();
        } else if (request.url.match("/rest/.*")) {
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
		} else {
			path.exists(filename, function(exists) {
				// Serve static content
				if(exists) {
					if (fs.statSync(filename).isDirectory()) {
                        filename += '/index.html';
                    }
                    
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
		persons		: {type: Number, default: 1},
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
		places		: {type: Number, default: 4},
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
    
    // Add some stands
	new Stand({position: [24.465158	,60.99512	], name: "Tuntematon 1"}).save();
	new Stand({position: [24.813309	,60.219099	], name: "Leppävaara"}).save();
	new Stand({position: [24.68349	,60.220485	], name: "Bemböle"}).save();
	new Stand({position: [25.096335	,60.380908	], name: "Savio Juurakkokatu"}).save();
	new Stand({position: [25.270143	,60.380315	], name: "Nikkil"}).save();
	new Stand({position: [25.330825	,60.29852	], name: "S"}).save();
	new Stand({position: [25.17369	,60.251184	], name: "Tuntematon 2"}).save();
	new Stand({position: [25.10479	,60.405365	], name: "Keravan juna-asema"}).save();
	new Stand({position: [24.97246	,60.551804	], name: "Jokelan juna-asema"}).save();
	new Stand({position: [24.749193	,60.382266	], name: "Klaukkalan linja-autoautoasema"}).save();
	new Stand({position: [24.80891	,60.462201	], name: "Nurmij"}).save();
	new Stand({position: [24.751039	,60.527896	], name: "Rajam"}).save();
	new Stand({position: [24.649866	,60.486702	], name: "R"}).save();
	new Stand({position: [24.845753	,60.473507	], name: "Ruusulinna tanssilava"}).save();
	new Stand({position: [25.089769	,60.473846	], name: "J"}).save();
	new Stand({position: [24.436111	,60.125		], name: "Kirkkonummi, Toritie 3"}).save();
	new Stand({position: [24.538372	,60.158369	], name: "Masala, Junailijankuja Kirkkonummi"}).save();
	new Stand({position: [24.65596	,60.149954	], name: "Espoonlahti, Ulappatori"}).save();
	new Stand({position: [24.438572	,60.120004	], name: "Kirkkonummen juna-asema, Nummitie"}).save();
	new Stand({position: [24.599075	,60.189543	], name: "Kauklahden juna-asema, Hansatie"}).save();
	new Stand({position: [24.509468	,60.133908	], name: "Jorvas, Jorvaksenkaari"}).save();
	new Stand({position: [24.446769	,60.222318	], name: "Lapinkylä"}).save();
	new Stand({position: [24.80567	,60.176462	], name: "Tapiola, Tapiontori"}).save();
	new Stand({position: [24.79434	,60.183248	], name: "Pohjois-Tapiola, Louhentie"}).save();
	new Stand({position: [24.952301	,60.169173	], name: "Aleksanterinkatu 20-22 kohdalla."}).save();
	new Stand({position: [24.941829	,60.163403	], name: "Annankatu 3, vastap"}).save();
	new Stand({position: [24.939834	,60.170944	], name: "Rautatieasema, P"}).save();
	new Stand({position: [25.145291	,60.207416	], name: "Valkopaadentie 1 ostoskeskus, Vuosaari"}).save();
	new Stand({position: [24.928182	,60.179199	], name: "Continental"}).save();
	new Stand({position: [25.162897	,60.511026	], name: "Haarajoki asema"}).save();
	new Stand({position: [24.927099	,60.180122	], name: "Mannerheimintie 50"}).save();
	new Stand({position: [25.104361	,60.527532	], name: "Kellokoski Kirvesmiehentie"}).save();
	new Stand({position: [25.028272	,60.402122	], name: "Hyrylän linja-autoasema"}).save();
	new Stand({position: [24.784534	,60.178137	], name: "Länsiauto Areena"}).save();
	new Stand({position: [24.970937	,60.313098	], name: "Lentoasema keräily"}).save();
	new Stand({position: [24.966978	,60.317986	], name: "Lentoasema ulkomaa"}).save();
	new Stand({position: [24.969499	,60.31763	], name: "Lentoasema kotimaa"}).save();
	new Stand({position: [24.963963	,60.290704	], name: "Jumbo Vantaanportti"}).save();
	new Stand({position: [25.023293	,60.305568	], name: "Simonkallio Ostoskeskus"}).save();
	new Stand({position: [24.856803	,60.301178	], name: "Vantaanpuisto Ostoskeskus"}).save();
	new Stand({position: [25.031791	,60.293597	], name: "Tikkurila Peltolantie"}).save();
	new Stand({position: [24.822278	,60.278536	], name: "Varisto Martinkyläntie"}).save();
	new Stand({position: [24.962633	,60.296776	], name: "Veromiehenkylä Robert Hubertintie"}).save();
	new Stand({position: [24.891543	,60.295841	], name: "Voutila Näpinkuja"}).save();
	new Stand({position: [25.043635	,60.292512	], name: "Tikkurilan asema"}).save();
	new Stand({position: [24.806914	,60.263405	], name: "Pähkinärinne Pähkinänsärkijä"}).save();
	new Stand({position: [24.855323	,60.261,	], name: "Myyrmäen asema"}).save();
	new Stand({position: [24.853992	,60.277941  ], name: "Martinlaakson asema"}).save();
	new Stand({position: [25.075822	,60.34929,	], name: "Korson asema"}).save();
	new Stand({position: [25.059171	,60.323655  ], name: "Koivukylä asema"}).save();
	new Stand({position: [25.105991	,60.277685  ], name: "Hakunila Raudikkokuja"}).save();
	new Stand({position: [25.10891	,60.245115  ], name: "Länsimäki Maalinauhantie"}).save();
	new Stand({position: [24.75709	,60.224364  ], name: "Karamalmi Karaportti"}).save();
	new Stand({position: [24.729881	,60.211531  ], name: "Kauniainen rautatieasema"}).save();
	new Stand({position: [24.222665	,60.14127  	], name: "Siuntio asema"}).save();
	new Stand({position: [24.803824	,60.168884  ], name: "Westend terminaali"}).save();
	new Stand({position: [24.745867	,60.22577  	], name: "Viherlaakso Turuntie"}).save();
	new Stand({position: [24.833694	,60.185126  ], name: "Otaniemi Dipoli"}).save();
	new Stand({position: [24.758356	,60.179066  ], name: "Olarinluoma Luomannotko"}).save();
	new Stand({position: [24.768269	,60.194401  ], name: "Mankkaa Ostoskeskus"}).save();
	new Stand({position: [24.811807	,60.220708  ], name: "Leppävaara Läkkisepänkuja"}).save();
	new Stand({position: [24.651818	,60.175502  ], name: "Latokaski Kaskenpää"}).save();
	new Stand({position: [24.805198	,60.204154  ], name: "Laajalahti Kirvuntie"}).save();
	new Stand({position: [24.752433	,60.209474  ], name: "Kilo Kutojantie"}).save();
	new Stand({position: [24.828737	,60.174819  ], name: "Keilaniemi Keilaniementie"}).save();
	new Stand({position: [24.705334	,60.239321  ], name: "Järvenperä Auroranportti"}).save();
	new Stand({position: [24.71529	,60.31711  	], name: "Lahnus Lahnuksentie"}).save();
	new Stand({position: [24.738432	,60.162399  ], name: "Matinkylä Iso-Omena"}).save();
	new Stand({position: [24.732542	,60.164636  ], name: "Länsikeskus Piispanportti"}).save();
	new Stand({position: [24.701557	,60.162447  ], name: "Suomenoja Suomalaistentie"}).save();
	new Stand({position: [24.726169	,60.173026  ], name: "Olari Kuunkehrä"}).save();
	new Stand({position: [24.668727	,60.142231  ], name: "Soukka Ostoskeskus"}).save();
	new Stand({position: [24.637613	,60.154279  ], name: "Kivenlahti Merivirta"}).save();
	new Stand({position: [24.760094	,60.274813  ], name: "Juvanmalmi Pieni Teollisuuskatu"}).save();
	new Stand({position: [24.78035	,60.162351  ], name: "Haukilahti, Haukilahden ostoskeskus"}).save();
	new Stand({position: [24.658985	,60.204943  ], name: "Espoontori Asemakuja"}).save();
	new Stand({position: [24.656196	,60.20538,	], name: "Espoon asema"}).save();
	new Stand({position: [24.442885	,60.269253  ], name: "Veikkola Koskentie, Koskentori"}).save();
	new Stand({position: [21.411066	,60.800012  ], name: "Koulukadun ja Alinenkadun kulmassa"}).save();
	new Stand({position: [26.639807	,61.989046  ], name: "Tuntematon 3"}).save();
	new Stand({position: [24.945896	,60.158112  ], name: "Kapteeninkatu, puiston laita, vastapäätä Kapteenink. 22 ja Tehtaankatu 13"}).save();
	new Stand({position: [24.952333	,60.165116  ], name: "Eteläranta, Palacen talo, Eteläranta 10"}).save();
	new Stand({position: [24.941905	,60.160905  ], name: "Viiskulma, Laivurinrinne 2"}).save();
	new Stand({position: [24.947677	,60.16786, 	], name: "Pohjoisesplanadin ja Kluuvikadun kulma"}).save();
	new Stand({position: [24.930274	,60.163152  ], name: "Abrahaminkadun puolella, vastapäätä Abrahamink. 1"}).save();
	new Stand({position: [24.96465	,60.166088  ], name: "Hotellin pääovi,  Katajanokanlaituri 7"}).save();
	new Stand({position: [23.501161	,61.480724  ], name: "Tuntematon 4"}).save();
	new Stand({position: [23.51		,61.477348  ], name: "Tuntematon 5"}).save();
	new Stand({position: [24.84876	,60.18026 	], name: "Lehtisaari"}).save();
	new Stand({position: [24.86176	,60.1578    ], name: "Isokaari"}).save();
	new Stand({position: [24.88262	,60.1606    ], name: "Lauttasaarentie"}).save();
	new Stand({position: [24.90594	,60.1901    ], name: "5 Meilahden sairaalat Biomedicum Haartmaninkatu 8"}).save();
	new Stand({position: [24.91498	,60.16321 	], name: "Ruoholahti Itämerenkatu 14 Ruoholahden metro"}).save();
	new Stand({position: [24.91761	,60.1877    ], name: "Messeniuksenkatu Messeniuksenkatu 51 Yliopiston Apteekki"}).save();
	new Stand({position: [24.92236	,60.15615 	], name: "Länsisatama terminaalin pohjoispäässä"}).save();
	new Stand({position: [24.92326	,60.17734 	], name: "Mehiläinen Pohjoinen Hesperiankatu 17"}).save();
	new Stand({position: [24.92382	,60.1486    ], name: "Hernesaari Hernematalankatu Copterline Helikopteriasema"}).save();
	new Stand({position: [24.92407	,60.17911 	], name: "Töölöntori Runeberginkatu 53 Sandelsinkadun kulma"}).save();
	new Stand({position: [24.92442	,60.16192 	], name: "Seaside Ruoholahdenranta 3"}).save();
	new Stand({position: [24.92512	,60.18432 	], name: "Toivonkatu Toivonkatu 2 Kisahallin pohjoispääty"}).save();
	new Stand({position: [24.92858	,60.16993 	], name: "Rautatienkatu Eteläinen Rautatiekatu 10 Makuunin edessä"}).save();
	new Stand({position: [24.92879	,60.16803 	], name: "Radisson SAS Royal Kamppi Runeberginkatu 2 / Salomonkatu"}).save();
	new Stand({position: [24.93047	,60.17433 	], name: "Museokatu Museokatu 12 puiston laidassa"}).save();
	new Stand({position: [24.91216	,60.19099 	], name: "Tukholmankatu 2 Tullinpuomi Shelliä vastapäätä"}).save();
	new Stand({position: [24.87223	,60.19244 	], name: "Kalastajatorppa"}).save();
	new Stand({position: [24.87631	,60.1984    ], name: "Munkkiniemi"}).save();
	new Stand({position: [24.92673	,60.19853 	], name: "Länsi-Pasila Maistraatinportti 4 Hotelli Pasilaa vastapäätä"}).save();
	new Stand({position: [24.90043	,60.20317 	], name: "Ruskeasuo"}).save();
	new Stand({position: [24.92795	,60.20521 	], name: "Hartwall Areena Veturitie 13 Areenan ylätasanne "}).save();
	new Stand({position: [24.87811	,60.20541 	], name: "Munkkivuori"}).save();
	new Stand({position: [24.91944	,60.20575 	], name: "Ilmala MTV:n edessä Ilmalantori 1"}).save();
	new Stand({position: [24.87266	,60.21403 	], name: "Pitäjänmäki"}).save();
	new Stand({position: [24.89739	,60.21545 	], name: "Etelä-Haaga"}).save();
	new Stand({position: [24.89453	,60.22549 	], name: "Pohjois-Haaga"}).save();
	new Stand({position: [24.88255	,60.22983 	], name: "Lassila"}).save();
	new Stand({position: [24.84631	,60.23794 	], name: "Tuntematon 6"}).save();
	new Stand({position: [24.88564	,60.24204 	], name: "Kannelmäki"}).save();
	new Stand({position: [24.86412	,60.24776 	], name: "Malminkartano"}).save();
	new Stand({position: [24.95789	,60.16107 	], name: "Olympiaterminaali / Meriasema Tallink-Siljan terminaali"}).save();
	new Stand({position: [24.94278	,60.16625 	], name: "Klaus K Hotelli Bulevardi 2"}).save();
	new Stand({position: [24.96847	,60.1663    ], name: "Katajanokka hotelli Merikasarminkatu"}).save();
	new Stand({position: [24.93116	,60.16651 	], name: "Lapinlahdenkatu Lapinlahdenkatu 3 vastapäätä"}).save();
	new Stand({position: [24.96054	,60.1667    ], name: "Kanavaterminaali terminaalin eteläpääty"}).save();
	new Stand({position: [24.9414	,60.16765 	], name: "Marski hotelli Mannerheimintie 10"}).save();
	new Stand({position: [24.93836	,60.16787 	], name: "hotelli Torni Yrjönkatu 26"}).save();
	new Stand({position: [24.93515	,60.16885 	], name: "Hotelli Simonkenttä pääoven edessä"}).save();
	new Stand({position: [24.93629	,60.17097 	], name: "Linja-autoasema Salomonkatu 2 Lasipalatsin pohjoispäädyssä"}).save();
	new Stand({position: [24.9333	,60.17098 	], name: "Hotelli Presidentti Eteläinen rautatiekatu 4 hotelli Presidentin edessä"}).save();
	new Stand({position: [24.94236	,60.17168 	], name: "RautatientoriTorin puoli teatterin vieressä"}).save();
	new Stand({position: [24.93931	,60.17232 	], name: "Taksitolppa147 Holiday Inn City Centre Elielinaukio 5 pääoven edessä"}).save();
	new Stand({position: [24.94532	,60.17253 	], name: "Radisson SAS Plaza Mikonkatu 23"}).save();
	new Stand({position: [24.95647	,60.17386 	], name: "Mariankatu Mariankatu 23 Maneesikadun yhä"}).save();
	new Stand({position: [24.9512	,60.17796 	], name: "Hakaniemi Hakaniemenranta 1 Metallitalon edessä"}).save();
	new Stand({position: [24.94905	,60.18005 	], name: "Ympyrätalo Eläintarhantie 1 Rosson edessä"}).save();
	new Stand({position: [24.95274	,60.18372 	], name: "Karhupuisto Fleminginkatu 1 5. linjan yhä"}).save();
	new Stand({position: [24.9492	,60.18644 	], name: "Helsinginkatu 25 Brahenkentän vieressä"}).save();
	new Stand({position: [24.96093	,60.18754 	], name: "Sörnäisten metroasema Helsinginkatu 3 Harjukadun kulma"}).save();
	new Stand({position: [24.93999	,60.19057 	], name: "1 Linnanmäki Alppilan puoli"}).save();
	new Stand({position: [24.94605	,60.19085 	], name: "Porvoonkatu Porvoonkatu 19 Viipurinkulma raitiovaunupysäkki"}).save();
	new Stand({position: [24.95433	,60.19579 	], name: "Hollolantie Hollolantie 1 Mäkelänkadun kulma"}).save();
	new Stand({position: [24.93373	,60.19854 	], name: "Pasilan asema Aseman pääovi"}).save();
	new Stand({position: [24.93686	,60.20155 	], name: "Messuhotelli Rautatieläisenkatu 3 Messukeskuksen ja hotellin vieressä"}).save();
	new Stand({position: [24.95057	,60.20364 	], name: "Sofianlehto"}).save();
	new Stand({position: [24.95853	,60.21603 	], name: "Käpylä/Koskela"}).save();
	new Stand({position: [24.96562	,60.22988 	], name: "Oulunkylä Oulunkylän tori"}).save();
	new Stand({position: [24.93459	,60.23193 	], name: "Maunula"}).save();
	new Stand({position: [24.94128	,60.2494    ], name: "Paloheinä"}).save();
	new Stand({position: [24.96986	,60.16402 	], name: "Viking-terminaali Katajanokan terminaali"}).save();
	new Stand({position: [25.05213	,60.17942 	], name: "Laajasalo"}).save();
	new Stand({position: [25.00617	,60.18576 	], name: "Kulosaari"}).save();
	new Stand({position: [25.02831	,60.19457 	], name: "Herttoniemi Hiihtäjäntie"}).save();
	new Stand({position: [24.97214	,60.20603 	], name: "Saudi"}).save();
	new Stand({position: [25.0375	,60.20778 	], name: "Herttoniemen sairaala"}).save();
	new Stand({position: [25.02327	,60.2261    ], name: "Viikki Alempi talonpojantie 4 Tilanhoitajankaaren kulma"}).save();
	new Stand({position: [25.00922	,60.2344    ], name: "Pihlajamäki"}).save();
	new Stand({position: [24.99364	,60.24335 	], name: "Pukinmäki"}).save();
	new Stand({position: [25.0		,60.2505    ], name: "Tuntematon 7"}).save();
	new Stand({position: [24.993	,60.2589    ], name: "Ylä-Malmi"}).save();
	new Stand({position: [24.99044	,60.27543 	], name: "Siltamäki"}).save();
	new Stand({position: [25.03544	,60.27544 	], name: "Tapulikaupunki"}).save();
	new Stand({position: [25.06011	,60.20206 	], name: "Roihuvuori"}).save();
	new Stand({position: [25.07458	,60.16506 	], name: "Jollas"}).save();
	new Stand({position: [25.07506	,60.22389 	], name: "Myllypuro"}).save();
	new Stand({position: [25.07526	,60.26136 	], name: "Jakomäki"}).save();
	new Stand({position: [25.07639	,60.20998 	], name: "Itäkeskus"}).save();
	new Stand({position: [25.08406	,60.23585 	], name: "Kontula"}).save();
	new Stand({position: [25.09549	,60.21713 	], name: "Vartiokylä"}).save();
	new Stand({position: [25.10966	,60.23803 	], name: "Mellunmäki"}).save();
	new Stand({position: [25.66506	,60.39224 	], name: "Porvoo Raatihuoneenkatu 11 Porvoon torilla"}).save();
	new Stand({position: [24.970744	,60.290056  ], name: "Hotelli Flamingo"}).save();
	new Stand({position: [24.596887	,60.23783 	], name: "Nupuri, Brobackantie"}).save();
	new Stand({position: [24.966002	,60.313093  ], name: "Hotelli Hilton, lentoasema"}).save();
	new Stand({position: [25.041747	,60.29079   ], name: "Hotelli Vantaa"}).save();
	new Stand({position: [24.069114	,60.251802  ], name: "Sibeliuksenkatu"}).save();
	new Stand({position: [24.06332	,60.248224  ], name: "Linja-auto asema, Kauppakatu"}).save();
	new Stand({position: [24.12293	,60.259999  ], name: "Lohjan asema"}).save();
	new Stand({position: [23.998475	,60.191249  ], name: "Virkkala"}).save();
	new Stand({position: [24.026756	,60.206052  ], name: "Tanhuhovi, Lohja"}).save();
	new Stand({position: [25.315547	,60.633869  ], name: "Mäntsälän linja-autoasema"}).save();
	new Stand({position: [25.309324	,60.648934  ], name: "Mäntsälän rautatieasema"}).save(
        function() {
        	var route_fixtures = true;
        	if (route_fixtures) {
                // request = {origin: [long, lat], destination: [long, lat], persons: num, address: str}
                taksi.add_request(function(){}, {origin: [24.83511, 60.188135   ], destination: [24.760437,60.203322 ], persons: 1, address: "Mankkaa" });
                taksi.add_request(function(){}, {origin: [24.833565,60.186940   ], destination: [24.833565,60.186940 ], persons: 1, address: "Kallio"  });
                taksi.add_request(function(){}, {origin: [24.827728,60.182331   ], destination: [24.827728,60.182331 ], persons: 1, address: "Haaga"   });
                taksi.add_request(function(){}, {origin: [24.836998,60.188817   ], destination: [24.836998,60.188817 ], persons: 1, address: "Pasila"  });
        	}
        });
}

init = function() {
    // Init DB
    init_database();
	// Init Http
	init_http();
}

// Init stuff
init();

console.log(settings.name + ' running at ' + settings.http.host + ":" + settings.http.port + "/");
