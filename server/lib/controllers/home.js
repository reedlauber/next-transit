var route_types = require('../models/route_types'),
	home = require('./controller').create('home');

function filtered_types(all_types) {
	var filtered_types = [];
	all_types.forEach(function(type) {
		if(type.route_type_order >= 0) {
			type.path = '/' + type.slug;
			if(type.parent) {
				type.path = '/' + type.parent + type.path;
			}
			filtered_types.push(type);
		}
	});
	return filtered_types;
}

home.action('index', function(req, res, callback) {
	route_types.all().then(function(types) {
		callback({ route_types:filtered_types(types) });
	}, function(err) {
		console.log('Error getting route_types', err);
		callback({});
	});
});

module.exports = home;