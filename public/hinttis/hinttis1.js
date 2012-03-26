// Constants
var START_MARKER = 'https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=beer|4477FF';
var MARKER_SHADOW = new google.maps.MarkerImage('http://maps.gstatic.com/mapfiles/markers2/marker_sprite.png',
												new google.maps.Size(28,35),	// Size
												new google.maps.Point(28,0),	// Origin
												new google.maps.Point(2,34));	// Anchor

// Variables
var origin = null;
var destinations = [];

var distanceMatrix = null;
var bestRoute = null;
var map = null;

var directionsService;
var directionsRenderer;
var distanceMatrixService;

/*
 * 
 * Page 1 (Map)
 */
 
$('#page1').live("pagecreate", function() {
    $('#map_canvas').gmap( { 'zoom': 11, 
                             'mapTypeControl': false,
                             'keyboardShortcuts': false,
                             'panControl': false,
                             'rotateControl': false,
                             'scaleControl': false,
                             'streetViewControl': false,
                             'callback': 
        function (newMap) {
			map = newMap;
			navigator.geolocation.getCurrentPosition(function(position, status) {
					var markerPosition = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                    map.panTo(markerPosition);
	                
					// Add marker
					origin = new google.maps.Marker({
						position: markerPosition,
						map: map,
						draggable: true,
						icon: START_MARKER,
						shadow: MARKER_SHADOW
					});
		            google.maps.event.addListener(origin, 'dragend', update_route);
			});
            
            // Add event listener
            google.maps.event.addListener(map, 'click', function (event) {
                // Add marker
				var marker = new google.maps.Marker({
					position: event.latLng,
					map: map,
					draggable: true
				});
				
				destinations.push(marker);
				
				update_route();
				
				google.maps.event.addListener(marker, 'click', function (event) {
					for (var i in destinations) {
						if (destinations[i] === marker) {
							destinations.splice(i,1);
						}
					}
					marker.setMap(null);
					update_route();
				});
				
	            google.maps.event.addListener(marker, 'dragend', update_route);
            });
			
            directionsRenderer = new google.maps.DirectionsRenderer();
            directionsRenderer.setOptions({
				suppressMarkers: true,
                hideRouteList: true
            });
        }
    });
	
    directionsService = new google.maps.DirectionsService();
    distanceMatrixService = new google.maps.DistanceMatrixService();
});


function update_route() {
	if (!destinations.length) {
		directionsRenderer.setMap(null);
		return;
	}
	
	var originLatLng = origin.getPosition();
	var destinationLatLngs = [];
	for (var i in destinations) {
		destinationLatLngs.push(destinations[i].getPosition());
	}
	
	getDistanceMatrix(originLatLng, destinationLatLngs, function(matrix) {
		distanceMatrix = matrix;
		bestRoute = getBestRoute(matrix);
		
		// Create waypoints
		var waypoints = []
	    var destination = destinationLatLngs[bestRoute[bestRoute.length-1]];
	    for (var i = 0; i < bestRoute.length-1; i++) {
	        waypoints.push({location: destinationLatLngs[bestRoute[i]]});
	    }
		
	    // Show directions
	    var directions_request = {
	        origin: originLatLng,
	        destination: destination,
	        waypoints: waypoints,
	        provideRouteAlternatives: false,
	        unitSystem: google.maps.UnitSystem.METRIC,
	        travelMode: google.maps.TravelMode.DRIVING
	    };
        directionsService.route(directions_request, function(result, status) {
	        if (status == google.maps.DirectionsStatus.OK) {
	            directionsRenderer.setDirections(result);
				directionsRenderer.setMap(map);
	        } else {
	            console.log(status);
	        }
	    });
	});
}

/*
 * 
 * Page 2 (Route data)
 */
$('#page2').live("pageshow", function() {
    if (!distanceMatrix) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
	
	// Get distances
    var distances = getDistances(distanceMatrix, bestRoute);
    
	// Get persons
	var persons = []
	for (i in bestRoute) {
		persons[i] = 1;
	}
	
	// Get costs
    costs = calculate_costs(distances, persons);
	
    // Populate table
    var table = $('#route_summary_table');
    table.empty();
	
    var stop_counter = 1;
	var totalCost = 0;
	var totalDistance = 0;
    for (var i in bestRoute ) {
        var stop = "Stop " + stop_counter;
      	stop_counter += 1;
		
        var km = distances[i] / 1000;
        var cost = Math.round(costs[i]*100)/100;
        var address = distanceMatrix.destinationAddresses[bestRoute[i]];
		
		totalCost += cost;
		totalDistance = km;
        
        table.append('<tr><td><strong>' + stop + '</strong> (' + km + ' km)</td><td style="float:right;"><strong>' + 
                                                cost + ' €</strong></td></tr>');
        table.append('<tr><td colspan="2">' + address + '</td></tr>');
        table.append('<tr><td colspan="2"><hr /></td></tr>');
    }
            
    table.append('<tr><td><strong>TOTAL</strong> ('+ totalDistance +' km)</td>'+
                 '<td style="float:right;"><strong>' + totalCost + ' €</strong></td></tr>');
    table.append('<tr><td></td><td></td></tr>');
});

     
/*
 * 
 * Helpers
 */
function getDistanceMatrix(origin, destinations, callback) {
    var origins = [origin];
    for (var i in destinations) {
        origins.push(destinations[i]);
    }
	
    distanceMatrixService.getDistanceMatrix({
        origins: origins,
        destinations: destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC
    }, function(matrix, status) {
        if (status != google.maps.DistanceMatrixStatus.OK) {
            console.log(status);
        }
		
		callback(matrix)
	});
}

function getBestRoute(matrix) {
    var stop_count = destinations.length;
    var stops = [];
    for (var i = 0 ; i < stop_count ; i++) {
        stops.push(i);
    }

    var best_drive = [];
    var best_cost = null;
    function recurse(drive, stops) {
        // Permutationing
        if (stops.length) {
            for (var i = 0 ; i < stops.length ;  i++) {
                var own_drive = drive.slice();
                own_drive.push(stops[i]);
                recurse(own_drive, stops.slice(0,i).concat(stops.slice(i+1)));
            }
        } else {
            // Get cost
            var cost = 0;
            var prev = -1;
            for (var d in drive) {
                var element = matrix.rows[prev+1].elements[drive[d]];
                cost += element.distance.value;
                prev = drive[d];
            }
            if (!best_cost || cost < best_cost) {
                best_drive = drive;
                best_cost = cost;
            }
        }
    }

    recurse([], stops);
	return best_drive;
}

function getDistances(matrix, bestRoute) {
	// Get distances
    var distances = [];
    var prev = 0;
    var cumulative_distance = 0;
    for (var i in bestRoute) {
		var current = bestRoute[i];
        cumulative_distance += distanceMatrix.rows[prev].elements[current].distance.value;
        distances.push(cumulative_distance);
		prev = current + 1;
    }
	
	return distances;
}

function calculate_costs(distances, persons) {
    var groups = distances.length;
    var total_persons = 0;
    var i;
    
    for (i in persons) {
        total_persons += persons[i];
    }
            
    var prices = [];
            
    // Starting price
    var starting_price = start_price(new Date());
    for (i in persons) {
        prices[i] = starting_price * persons[i] / total_persons;
    }
            
    var price_per_km = persons <= 2 ? 1.43 : 1.72;
    price_per_km *= 1.10;
            
    var leg_persons = persons;
    var previous_leg_distance = 0;
    for (i in distances) {
        var leg_distance = distances[i] - previous_leg_distance;
        var leg_cost = leg_distance * price_per_km/1000;
        for (var j = i ; j < prices.length ; j++) {
            prices[j] += leg_cost / total_persons;
        }
        leg_persons -= persons[i];
        previous_leg_distance = distances[i];
    }
    return prices;
}
        
function start_price(date) {
    var LO = 5.5;
    var HI = 8.6;
            
    var hour = date.getHours();
    var dateString = date.getMonth() + "." + date.getDay();
            
    var six_to_eight = hour >= 6 && hour < 20;
    var six_to_four = hour >= 6 && hour < 16; 
            
    var holiday = holidays[dateString] || false;
    var preholiday = preholidays[dateString] || false;
            
    if (holiday) {
        return HI;
    } else if (preholiday) {
        return six_to_four ? LO : HI;
    } else {
        switch(date.getDay()) {
            case 0:    // Sunday
                return HI;
            case 1:    // Monday
            case 2:
            case 3:
            case 4:
            case 5:
                return six_to_eight ? LO : HI;
            case 6:
                return six_to_four ? LO : HI;
        }
    }
}
        
var holidays = {
    "1.6":   1, // loppiainen (pe)
    "4.6":   1, // pitkäperjantai (pe)
    "4.9":   1, // toinen pääsiäispäivä (ma)
    "5.1":   1, // vapunpäivä (ti)
    "5.17":  1, // helatorstai (to)
    "6.23":  1, // juhannus (la)
    "11.3":  1, // pyhäinpäivä (la)
    "12.6":  1, // itsenäisyyspäivä (to)
    "12.24": 1, // jouluaatto (ma)
    "12.25": 1, // joulupäivä (ti)
    "12.26": 1  // tapaninpäivä (ke)
};
        
var preholidays = {
    "1.6":   1, // loppiainen (pe)
    "4.6":   1, // pitkäperjantai (pe)
    "4.9":   1, // toinen pääsiäispäivä (ma)
    "5.1":   1, // vapunpäivä (ti)
    "5.17":  1, // helatorstai (to)
    "6.23":  1, // juhannus (la)
    "11.3":  1, // pyhäinpäivä (la)
    "12.6":  1, // itsenäisyyspäivä (to)
    "12.24": 1, // jouluaatto (ma)
    "12.25": 1, // joulupäivä (ti)
    "12.26": 1  // tapaninpäivä (ke)
};
        
var postalCodeMapping = {
    '00002': "Helsinki",
    '00010': "Postikeskus",
    '00100': "Kamppi, Etu-Töölö, Kaisaniemi, Hietaniemi, Kluuvi",
    '00102': "Eduskunta",
    '00120': "Punavuori, Hietalahti",
    '00130': "Kaartinkaupunki",
    '00140': "Kaivopuisto, Ullanlinna",
    '00150': "Hernesaari, Munkkisaari, Eira, Ullanlinna",
    '00160': "Katajanokka",
    '00170': "Kruununhaka",
    '00180': "Ruoholahti, Salmisaari, Lapinlahti",
    '00190': "Suomenlinna",
    '00200': "Lauttasaari",
    '00210': "Lauttasaari, Vattuniemi",
    '00220': "Jätkäsaari, Länsisatama",
    '00230': "Kivihaka",
    '00240': "Pasila, Ilmala",
    '00250': "Taka-Töölö, Laakso, Meilahti, Eläintarha",
    '00260': "Töölö",
    '00270': "Laakso, Pikku Huopalahti",
    '00280': "Ruskeasuo",
    '00290': "Meilahden sairaala",
    '00300': "Pikku Huopalahti",
    '00310': "Kivihaka",
    '00320': "Haaga, Etelä-Haaga",
    '00330': "Munkkiniemi",
    '00340': "Lehtisaari, Kaskisaari, Kuusisaari",
    '00350': "Munkkivuori, Talinranta",
    '00360': "Pajamäki",
    '00370': "Marttila, Reimarla, Pitäjänmäki",
    '00380': "Pitäjänmäki",
    '00390': "Konala",
    '00400': "Pohjois-Haaga",
    '00410': "Malminkartano",
    '00420': "Kannelmäki",
    '00430': "Hakuninmaa, Maununneva",
    '00440': "Lassila",
    '00500': "Sörnäinen",
    '00510': "Kallio",
    '00520': "Itä-Pasila",
    '00530': "Hakaniemi",
    '00540': "Sompasaari",
    '00550': "Hermanni",
    '00560': "Vanhakaupunki",
    '00570': "Kulosaari",
    '00580': "Sörnäinen",
    '00590': "Tahvonlahti",
    '00600': "Käpylä, Koskela",
    '00610': "Käpylä",
    '00620': "Metsälä",
    '00630': "Maunula",
    '00640': "Patola",
    '00650': "Veräjämäki",
    '00660': "Länsi-Pakila",
    '00670': "Paloheinä",
    '00680': "Itä-Pakila",
    '00690': "Torpparinmäki",
    '00700': "Torpparinmäki",
    '00710': "Pihlajamäki",
    '00720': "Pukinmäki",
    '00730': "Tapanila",
    '00740': "Suutarila",
    '00750': "Tapulikaupunki",
    '00760': "Heikinlaakso, Puistola",
    '00770': "Jakomäki",
    '00780': "Tapaninvainio",
    '00790': "Latokartano",
    '00800': "Herttoniemi",
    '00810': "Herttoniemenranta",
    '00820': "Roihuvuori",
    '00830': "Tammisalo",
    '00840': "Yliskylä",
    '00850': "Jollas",
    '00860': "Santahamina",
    '00870': "Hevossalmi",
    '00880': "Roihuvuori",
    '00890': "Östersundom",
    '00900': "Puotinharju",
    '00910': "Puotila",
    '00920': "Myllypuro",
    '00930': "Marjaniemi",
    '00940': "Kontula",
    '00950': "Vartioharju",
    '00960': "Vuosaari",
    '00970': "Mellunmäki",
    '00980': "Meri-Rastila",
    '00990': "Aurinkolahti",
    '02100': "Tapiola, Hakalehto",
    '02110': "Tapiola",
    '02120': "Suvikumpu, Hakalehto",
    '02130': "Pohjois-Tapiola, Koivu-Mankkaa, Pyhäristi",
    '02140': "Laajalahti, Laajaranta, Friisinmäki",
    '02150': "Otaniemi, Keilaniemi, Maari",
    '02160': "Westend",
    '02170': "Haukilahti",
    '02180': "Mankkaa, Seilimäki, Klovi, Taavinkylä",
    '02200': "Suvikumpu, Henttaa, Kokinkylä, Lystimäki, Piispankylä",
    '02210': "Puolarmetsä, Puolarmaari, Olari, Kuitinmäki, Piispankylä",
    '02230': "Matinkylä, Tiistilä, Nuottalahti, Nuottaniemi, Koivuniemi, Iirislahti",
    '02240': "Friisilä",
    '02260': "Kaitaa, Riilahti, Hyljelahti, Iivisniemi",
    '02270': "Eestinmäki, Hannus, Nuottalahti",
    '02280': "Eestinlaakso, Kukkumäki, Malminmäki",
    '02290': "Puolarmetsän sairaala",
    '02300': "Nöykkiö",
    '02320': "Kivenlahti",
    '02330': "Kattilalaakso",
    '02340': "Latokaski",
    '02360': "Soukka, Soukanranta",
    '02380': "Rämsö, Suvisaaristo",
    '02600': "Leppävaara, Ruusutorppa, Säteri, Perkkaa, Ruukinranta, Yhdyskunanmäki",
    '02610': "Kilo, Karamalmi, Kuninkainen",
    '02620': "Rastaala, Rastaspuisto, Karakallio, Leppäsilta",
    '02630': "Nihtisilta, Nuijala, Lansa",
    '02650': "Vallikallio, Mäkkylä, Puustellinmäki",
    '02660': "Lintuvaara",
    '02680': "Lehtovuori",
    '02710': "Viherlaakso",
    '02720': "Karakallio",
    '02730': "Laaksolahti",
    '02740': "Karhusuo, Bemböle",
    '02750': "Kuurinniitty, Sepänkylä",
    '02760': "Espoonkeskus",
    '02770': "Espoonkeskus",
    '02780': "Espoonkartano",
    '02810': "Gumböle, Hirvisuo",
    '02820': "Brobacka, Nuuksio",
    '02860': "Nuuksio",
    '02920': "Kalajärvi",
    '02940': "Lippajärvi",
    '02970': "Kalajärvi, Metsämaa",
    '02980': "Espoo",
    '01009': "Vantaa",
    '01200': "Nissas, Sotunki",
    '01230': "Vaarala, Kuussilta, Suurmetsä",
    '01260': "Kolohonka, Kuninkaanmäki, Itä-Hakkila",
    '01280': "Länsimäki, Rajakylä",
    '01300': "Koivuhaka, Simonkallio, Viertola, Kukkaketo",
    '01350': "Simonkylä, Malminiitty, Hiekkaharju",
    '01360': "Koivukylä, Rautkallio, Havukoski, Sahamäki",
    '01370': "Jokiniemi, Satomäki, Maarinkunnas, Stenkulla",
    '01380': "Kuusikko, Kanerva, Hakkila, Hakkilankallio, Porttipuisto",
    '01390': "Kylmäoja, Ilola, Harjusuo, Ruskeasanta",
    '01400': "Rekolanmäki, Asola, Rekola, Matari, Rekolanranta, Päiväkumpu",
    '01420': "Päiväkumpu, Rekolanranta",
    '01450': "Korkinmäki, Vähä-Muori, Vallinoja, Leppäkorpi, Korso",
    '01480': "Maarukanmetsä, Jokivarsi, Haapala",
    '01490': "Pohjois-Nikinmäki, Nikinmäki, Viirilä",
    '01510': "Virkamies, Veromies, Veromiehenkylä, Veromäki, Köyhämäki, Sandbacka, ",
    '01530': "Lentoasema",
    '01600': "Louhela, Jönsas, Kilteri",
    '01610': "Gruva, Silvola, Kaivoksela, Vaskipelto",
    '01620': "Tyttökumpu, Kivimäki, Martinlaakso",
    '01630': "Hämeenkylä, Backas, Långbacka, Linnainen",
    '01640': "Linnainen, Koivuvaara, Hämevaara",
    '01650': "Pellas, Vapaala, Rajatorppa",
    '01660': "Varisto",
    '01670': "Vantaanlaakso, Smeds, Viherkumpu, Perkiö",
    '01680': "Koivurinne, Askisto",
    '01690': "Ylästö, Tolkinmetsä, Tolkinkylä, Mansikkamäki",
    '01700': "Rauhala, Kannisto, Kivistö",
    '01710': "Pähikärinne",
    '01730': "Sotilaskorpi, Rajasilta, Lapinniitty, Petas, Vantaanpuisto",
    '01750': "Keimola",
    '01760': "Männikkö, Pirttiranta, Seutula, Koivikko, Tapola"
};
