var common = {};

/*
*
*	Common business logic functions
*/

/**
* Gets the best route from the given distanec matrix. The best route is the shortest one.
* Returns an array of indexes which is the sort-array of the order in the matrix
*/
common.getBestRoute = function(matrix, split) {
	var stop_count = matrix.destinationAddresses.length;
    var stops = [];
    for (var i = 0 ; i < stop_count ; i++) {
        stops.push(i);
    }
	
    drive_data = common.driveRecursion([], stops, matrix, split);
	return drive_data.drive;
}

common.driveRecursion = function(drive, stops, matrix, split) {
    // Permutationing
    if (stops.length) {
		var best = {'cost': Infinity};
        for (var i = 0 ; i < stops.length ;  i++) {
            var newDrive = drive.slice();
			newDrive.push(stops[i]);
			var stopsLeft = stops.slice(0,i).concat(stops.slice(i+1));
			
            // Dont split
			var drive_data = common.driveRecursion(newDrive, stopsLeft, matrix, split);
			best = drive_data.cost < best.cost ? drive_data : best;
			
			if (split) {
				// Or split into
	            var drive_data_split = common.driveRecursion(newDrive, [], matrix, split);
				// and
	            var drive_data_aux = common.driveRecursion([], stopsLeft, matrix, split);
			
				drive_data_split.cost += drive_data_aux.cost;
				drive_data_split.drive.push.apply(drive_data_split.drive, drive_data_aux.drive);
				best = drive_data_split.cost < best.cost ? drive_data_split : best;
			}
        }
		
		return best;
    } else {
        // Get cost
        var cost = 0;
        var prev = -1;
        for (var d in drive) {
            var element = matrix.rows[prev+1].elements[drive[d]];
            cost += element.distance.value;
            prev = drive[d];
        }
		
		if (split) {
			drive = [drive]
		}
		
		return {'drive': drive, 'cost': cost};
    }
}


/**
* Gets the distances of the given best route in the distance matrix.
* Returns an array of distances (not the cumulative distance)
*/
common.getDistances = function(matrix, bestRoute) {
	// Get distances
    var distances = [];
    var prev = 0;
    for (var i in bestRoute) {
		var current = bestRoute[i];
        var distance = matrix.rows[prev].elements[current].distance.value;
        distances.push(distance);
		prev = current + 1;
    }
	
	return distances;
}

/**
* Calculates the costs of the number of persons given travelling the distances given.
* Returns an array of costs
*/
common.getCosts = function(distances, persons) {
	// Default persons to 1
	if (!persons) {
		persons = []
		for (var i in distances) {
			persons.push(1)
		}
	}
	
	// Total number of persons in beginning of trip
    var total_persons = 0;
    for (var i in persons) {
        total_persons += persons[i];
    }
    
    var prices = [];
    
    // Starting price
    var starting_price = common.getStartPrice();
    for (var i in persons) {
        prices[i] = (starting_price * persons[i]) / total_persons;
    }
    
	// KM prices       
    for (var i in distances) {
		// Calculate leg cost
		var pricePerKm = common.getKmPrice(total_persons) * 1.1;
		var leg_cost = (distances[i] * pricePerKm)/1000;
        
		// Divide according to number of persons per leg
		for (var j = i ; j < prices.length ; j++) {
            prices[j] += (leg_cost * persons[j]) / total_persons;
        }
		
		// Remove leaving persons
        total_persons -= persons[i];
    }
    return prices;
}

/**
* Calculates the start price for the given day.
*
*/
common.getStartPrice = function(date) {
	date = date || new Date();
	
    var NORMAL_PRICE = 5.5;
    var HIGH_PRICE = 8.6;
            
    var hour = date.getHours();
	var day = date.getDay();
    var dateString = date.getMonth() + "." + day;
    
    var holiday = common.holidays[dateString] || (day === 0);
    var eve = common.eves[dateString] || (day === 6);
            
    if (holiday) {
        return HI;
    } else if (eve) {
        return (hour >= 6 && hour < 16) ? NORMAL_PRICE : HIGH_PRICE;
    } else {
        return (hour >= 6 && hour < 20) ? NORMAL_PRICE : HIGH_PRICE;
    }
}

common.getKmPrice = function(persons) {
	switch (persons) {
	case 0:
	case 1:
	case 2:
		return 1.43;
	case 3:
	case 4:
		return 1.72;
	case 5:
	case 6:
		return 1.86;
	default:
		return 2.01;
	}
}

/**
* Rounds the given value to 2 decimals
*/
common.round = function(value) {
	return Math.round(value*100)/100;
};

/**
* Returns a close latLng
*/
common.getLatLng = function() {
    if ( google.loader.ClientLocation !== null ) {
        return new google.maps.LatLng(google.loader.ClientLocation.latitude, google.loader.ClientLocation.longitude);    
    }
    return new google.maps.LatLng(60.195132,24.933472);
}


/*
*
*	DATA
*
*/
common.holidays = {
    "1.6":   1, // loppiainen (pe)
    "4.6":   1, // pitkäperjantai (pe)
    "4.9":   1, // toinen pääsiäispäivä (ma)
    "5.1":   1, // vapunpäivä
    "5.17":  1, // helatorstai (to)
    "6.23":  1, // juhannus (la)
    "11.3":  1, // pyhäinpäivä (la)
    "12.6":  1, // itsenäisyyspäivä
    "12.24": 1, // jouluaatto
    "12.25": 1, // joulupäivä
    "12.26": 1  // tapaninpäivä
};
        
common.eves = {
    "1.5":   1, // loppiaisen aatto (to)
    "4.5":   1, // pitkäperjantain aatto (to)
    "4.30":  1, // vappuaatto
    "5.16":  1, // helatorstain aatto (ke)
    "6.22":  1, // juhannusaatto (pe)
    "11.2":  1, // pyhäinpäivän aatto (pe)
    "12.5":  1, // itsenäisyyspäivän aatto
    "12.31": 1  // uudenvuoden aatto
};
        
common.postalCodeMapping = {
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

