// Constants
var REST_PATH = '/rest';
//var REST_PATH = 'http://localhost:8124/rest';

// Variables
var settings_persons = 1;
var settings_finder = true;
        
var position_latLng = null;
var destination_latLng = null;
        
var directionsService;
var directionsRenderer;
var distanceMatrixService;

var route_map = null;
var map_options = {
    
};

var own_index = null;
var route = null;
var route_points = [];
var total_data = {};

var notification_hash = "";
        
var polling = false;
  
var watch;

/*
 * 
 * Page 1 (Map)
 */
 $('#page1').live("pagehide", function() {
    if ( navigator.geolocation ) {
        navigator.geolocation.clearWatch(watch);
    }
});
                
$('#page1').live("pagecreate", function() {
    $('#map_canvas').gmap( { center: getLatLng(), 
                             zoom: 11, 
                             mapTypeControl: false,
                             keyboardShortcuts: false,
                             panControl: false,
                             rotateControl: false,
                             scaleControl: false,
                             streetViewControl: false,
                             callback: 
        function (map) {
            // Add location
            if ( navigator.geolocation ) {
                watch = navigator.geolocation.watchPosition ( 
                    function( position ) { 
                        // Get position
                        position_latLng = new google.maps.LatLng(position.coords.latitude, 
                                                                     position.coords.longitude);
                                
                        // Set position
                        $('#map_canvas').gmap('clear', 'markers');
                        $('#map_canvas').gmap('addMarker', 
                            { 'title'    : 'You are here!', 
                              'bound'    : false, 
                              'position': position_latLng,
                              'icon'    : new google.maps.MarkerImage('img/blue-dot.png', null, null, new google.maps.Point(25, 25))
                              }
                        );
                        map.panTo( position_latLng );
                    }
                );
            }
            
            // Add event listener
            google.maps.event.addListener(map, 'click', function (event) {
                // Store positions, go to next page
                destination_latLng = event.latLng;
                $.mobile.changePage($('#page3'));
            });
        }
    });
});
        
        
/*
 * 
 * Page 2 (Settings)
 */
$('#radio1').change(function(event) {settings_persons = 1;});
$('#radio2').change(function(event) {settings_persons = 2;});
$('#radio3').change(function(event) {settings_persons = 3;});
$('#radio4').change(function(event) {settings_persons = 4;});
        
$('#toggleswitch1').change(function(event) {settings_finder = !settings_finder;});
        
/*
 * 
 * Page 3 (Route data)
 */
$('#page3').live("pageshow", function() {
    if (!position_latLng || !destination_latLng) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
            
    if (route) {
        return;
    }
            
    // Update form / to
    latLng_to_string(destination_latLng, function(to_address) {
        $('#to_address').html(to_address);
                
        if (!settings_finder) {
            show_cost(to_address);
            return;
        }
                
        var route;
        var request;
        var requests;
        // Get route data
        $.ajax({
            type: 'PUT',
            url: REST_PATH + "/request",
            data: JSON.stringify({origin: [position_latLng.lng(), position_latLng.lat()],
                   destination: [destination_latLng.lng(), destination_latLng.lat()],
                     persons: settings_persons,
                destination_string: to_address
            }), 
            contentTypeString: 'application/json',
            dataType: 'json',
            success: function(route_data) {
                route = route_data.route;
                request = route_data.request;
                requests = route_data.requests;
                handle_route(route_data);

                // Poll for updates
                polling = true;
                setTimeout(function() { poll_request(route, request); }, 5000);
                        
            },
            fail: function(jqXHR, textStatus) {
                console.log(textStatus);
            }
        });
    });
});
        
function poll_request(route, request) {
    if (!polling) {
        return;
    }
            
    $.ajax({
        type: 'GET',
        url: REST_PATH + "/route/" + route._id,
        success: function(route_data) {
            // TODO: don't handle unless updated
            route_data.request = request;
            handle_route(route_data);
            setTimeout(function() { poll_request(route, request); }, 5000);
        },
        fail: function(jqXHR, textStatus) {
            console.log(textStatus);
        }
    });
}
        
$('#page3').live("pagecreate", function() {
    directionsService = new google.maps.DirectionsService();
    distanceMatrixService = new google.maps.DistanceMatrixService();
});
        
$('#page3').live("pagehide", function() {
    polling = false;
});
        
$('#accept_route').click(function() {
    // Update database
    $.ajax({
        type: 'POST',
        url: REST_PATH + "/request/complete/" + route_points[own_index].request._id
    });
});
        
$('#discard_route').click(function() {
    // Update database
    $.ajax({
        type: 'DELETE',
        url: REST_PATH + "/request/" + route_points[own_index].request._id
    });
            
    // Update client
    route = null;
});
        
function handle_route(route_data) {
    // Get data
    route = route_data.route;
    var request = route_data.request;
    var requests = route_data.requests;
    var stand = route.stand;
            
    var groups = requests.length;
            
    // Populate view
    $('#from_address').html(stand.name);
            
    if (groups >= 2) {
        $('#page3 .yksis').hide();
        $('#page3 .kimppis').show();
        $('#page3 #kimppises').html(groups -1);
    } else {
        $('#page3 .yksis').show();
        $('#page3 .kimppis').hide();
    }
            
    // Build destination matrix request
    var origins = [buildLatLng(stand.position)];
    var destinations = [];
    for (var i in requests) {
        var latlng = buildLatLng(requests[i].destination);
        origins.push(latlng);
        destinations.push(latlng);
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
                
        // Sort requests
        var sorted_requests = [];
        for (i in best_drive) {
            sorted_requests.push(requests[best_drive[i]]);
        }
        requests = sorted_requests;
                
        // Get distances
        var distances = [];
        var prev = -1;
        var cumulative_distance = 0;
        for (var current in best_drive) {
            cumulative_distance += matrix.rows[prev+1].elements[current].distance.value;
            distances.push(cumulative_distance);
        }
                
        // Get own id
        for (var r in requests) {
            if (request._id === requests[r]._id) {
                own_index = r;
                break;
            }
        }
                
        costs = calculate_costs(distances, requests);
                
        route_points = [];
        var total_distance = 0;
        var total_cost = 0;
        for (i in requests) {
            route_points[i] = {
                request: requests[i],
                distance: distances[i],
                cost: costs[i]
            };
            total_distance = distances[i];
            total_cost += costs[i];
        }
        total_data.distance = total_distance;
        total_data.cost = total_cost;
                
        kimppis_cost = costs[own_index];
        normal_cost = calculate_cost(matrix.rows[0].elements[own_index].distance.value, request.persons);
        difference = normal_cost - kimppis_cost;
                        
        // Update values
        $('#kimppis_price').html(Math.round(kimppis_cost*100)/100);
        $('#normal_price').html(Math.round(normal_cost*100)/100);
        $('#saved_price').html(Math.round(difference*100)/100);
    });
}
        
function show_cost(address) {
    var directions_request = {
            origin: position_latLng,
            destination: destination_latLng,
            provideRouteAlternatives: false,
            unitSystem: google.maps.UnitSystem.METRIC,
            travelMode: google.maps.TravelMode.DRIVING
    };
            
    // Get single distance
    directionsService.route(directions_request, function(result, status) {
        if (status === google.maps.DirectionsStatus.OK) {
            var distance = result.routes[0].legs[0].distance.value;
            var cost = calculate_cost(distance, settings_persons);
            
            route_points = [{
                distance: distance,
                cost: cost,
                request: {
                    origin: position_latLng,
                    destination: destination_latLng,
                    destination_string: address
                }
            }];
                    
            total_data = {
                distance: distance,
                cost: cost
            };
                    
            own_index = 0;
                    
            $.mobile.changePage($('#page6'));
        } else {
            console.log(status);
        }
    });
}
        
/*
 * 
 * Page 4 (Get ready)
 */
$('#page4').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
});
        
/*
 * 
 * Page 5 (Attract)
 */
$('#page5').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
});
        
/*
 * 
 * Page 6 (Summary)
 */
$('#page6').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
            
    var persons = route_points.length;
    var table = $('#route_summary_table');
    table.empty();
    var buddy;
    var buddy_counter = 1;
    for (var i in route_points ) {
        if (i == own_index) {
            buddy = "You";
        } else {
            buddy = "Buddy " + buddy_counter;
            buddy_counter += 1;
        }
        var route_point = route_points[i];
        var km = route_point.distance / 1000;
        var cost = Math.round(route_point.cost*100)/100;
        var address = route_point.request.destination_string;
                
        table.append('<tr><td><strong>' + buddy + '</strong> (' + km + ' km)</td><td style="float:right;"><strong>' + 
                                                cost + ' €</strong></td></tr>');
        table.append('<tr><td colspan="2">' + address + '</td></tr>');
        table.append('<tr><td colspan="2"><hr /></td></tr>');
    }
            
    var total_km = total_data.distance / 1000;
    var total_cost = Math.round(total_data.cost*100)/100;
    table.append('<tr><td><strong>TOTAL</strong> ('+ total_km +' km)</td>'+
                 '<td style="float:right;"><strong>' + total_cost + ' €</strong></td></tr>');
    table.append('<tr><td></td><td></td></tr>');
});
         
/*
 * 
 * Page 7 (Route map)
 */
$('#page7').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
    
    drawRoute();
});
        
$('#page7').live("pagecreate", function() {
    $('#route_map_canvas').gmap( { center: getLatLng(), 
                                 zoom: 11, 
                                 mapTypeControl: false,
                                 keyboardShortcuts: false,
                                 panControl: false,
                                 rotateControl: false,
                                 scaleControl: false,
                                 streetViewControl: false,
                                 callback: 
        function (map) {
            directionsRenderer = new google.maps.DirectionsRenderer();
            directionsRenderer.setOptions({
                map: map,
                hideRouteList: true
            });
        }
    });
});

function drawRoute() {
    // Get route
    
    
    var origin;
    var waypoints = [];
    
    if (settings_finder) {
        for (var i = 0; i < route_points.length-1; i++) {
            waypoints.push({location: buildLatLng(route_points[i].request.destination)});
        }
        origin = buildLatLng(route.stand.position);
    } else {
        origin = route_points[0].request.origin;
        waypoints.push({location: route_points[0].request.destination});
    }
    
    var directions_request = {
        origin: origin,
        destination: waypoints[waypoints.length-1].location,
        waypoints: waypoints,
        provideRouteAlternatives: false,
        unitSystem: google.maps.UnitSystem.METRIC,
        travelMode: google.maps.TravelMode.DRIVING
    };
                    
    // Show directions
    directionsService.route(directions_request, function(result, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.log(status);
        }
    });
}
        
/*
 * 
 * Helpers
 */
        
function getLatLng() {
    if ( google.loader.ClientLocation !== null ) {
        return new google.maps.LatLng(google.loader.ClientLocation.latitude, google.loader.ClientLocation.longitude);    
    }
    return new google.maps.LatLng(60.195132,24.933472);
}
        
function buildLatLng(position) {
    return new google.maps.LatLng(position[1], position[0]);
}
        
function latLng_to_string(latlng, callback) {
    if (!latlng) {
        callback("Unkown");
        return;
    }
            
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({'latLng': latlng}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            if (results[0]) {
                var components = results[0].address_components;
                var hood = "";
                var postal_code = "";
                var city = "";
                for (var i in components) {
                    switch(components[i].types[0]) {
                    case 'postal_code':
                        postal_code = components[i].long_name;
                        hood = postalCodeMapping[postal_code];
                        break;
                    case 'administrative_area_level_3':
                        city = components[i].long_name;
                        break;
                    }
                }
                        
                var string =  postal_code + " " + hood + ", " + city;
                callback(string);
            }
        } else {
            console.log("Geocoder failed due to: " + status);
        }
    });
}
        
function getDistance(point1, point2) {
    var lat1 = point1[1];
    var lon1 = point1[0];
    var lat2 = point2[1];
    var lon2 = point2[0];
    var R = 6371; // Radius of the earth in km
    var dLat = (lat2-lat1).toRad();  // Javascript functions in radians
    var dLon = (lon2-lon1).toRad(); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1.toRad()) * Math.cos(lat2.toRad()) * 
            Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; // Distance in km
}
        
if (typeof(Number.prototype.toRad) === "undefined") {
  Number.prototype.toRad = function() {
    return this * Math.PI / 180;
  };
}
        
function calculate_costs(distances, requests) {
    var groups = distances.length;
    var persons = 0;
    var i;
    
    for (i in requests) {
        persons += requests[i].persons;
    }
            
    var prices = [];
            
    // Starting price
    var starting_price = start_price(new Date());
    for (i in requests) {
        prices[i] = starting_price * requests[i].persons / persons;
    }
            
    var price_per_km = persons <= 2 ? 1.43 : 1.72;
    price_per_km *= 1.10;
            
    var leg_persons = persons;
    var previous_leg_distance = 0;
    for (i in distances) {
        var leg_distance = distances[i] - previous_leg_distance;
        var leg_cost = leg_distance * price_per_km/1000;
        for (var j = i ; j < prices.length ; j++) {
            prices[j] += leg_cost / persons;
        }
        leg_persons -= requests[i].persons;
        previous_leg_distance = distances[i];
    }
    return prices;
}
        
function calculate_cost(distance, persons) {
    var starting_price = start_price(new Date());
    var price_per_km = persons <= 2 ? 1.43 : 1.72;
    return starting_price + price_per_km * distance / 1000;
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
        
// Analytics
$('[data-role=page]').live('pageshow', function (event, ui) {
    try {
        _gaq.push(['_setAccount', 'YOUR_GA_ID']);

        hash = location.hash;

        if (hash) {
            _gaq.push(['_trackPageview', hash.substr(1)]);
        } else {
            _gaq.push(['_trackPageview']);
        }
    } catch(err) {
        console.log(err);
    }
});
