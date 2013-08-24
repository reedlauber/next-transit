var fs = require('fs'),
	promise = require('promise'),
	csv = require('csv'),
	timer = require('./timer'),
	transforms = require('./transforms'),
	sequential = require('./sequential'),
	gtfs_path = __dirname + '/../../../assets/gtfs',
	stage_path = gtfs_path + '/stage',
	batch_size = 100000;

function copy_to_database(file_name, model, columns, success, error) {
	model.import(columns, file_name, function() {
		if(typeof success === 'function') {
			success();
		}
	}, error);
}

function import_path(type, read_path, write_stream, model, columns) {
	return new promise(function(resolve, reject) {
		var transform = transforms.get_transform(type);

		csv()
			.from(read_path, { columns:true, trim:true })
			.to(write_stream, { delimiter:'\t',  columns:columns })
			.transform(function(record, idx) {
				if(idx && (idx % batch_size === 0)) {
					console.log('Processed ' + idx + ' so far ...');
				}
				transform(record);
				return record;
			})
			.on('end', function() {
				resolve();
			})
			.on('error', reject);
	});
}

function add_path_sequence(first, path, file_name, write_path, model, columns) {
	return function(next, error) {
		var flags = first ? 'w' : 'a',
			read_path = path + '/' + file_name + '.txt',
			write_stream = fs.createWriteStream(write_path, { flags:flags });

		if(!first) {
			write_stream.write('\n');
		}

		import_path(file_name, read_path, write_stream, model, columns).then(function() {
			write_stream.end();
		}, error);

		write_stream.on('finish', function() {
			next();
		});
	};
}

function importer(options) {
	var self = {},		
		paths = [];

	if(options.mode === 'bus' || options.mode === 'all') {
		paths.push(gtfs_path + '/google_bus');
	}
	if(options.mode === 'rail' || options.mode === 'all') {
		paths.push(gtfs_path + '/google_rail');
	}

	self.import_type = function import_type(title, file_name, columns) {
		return new promise(function(resolve, reject) {
			var model = require('../models/' + file_name),
				total_timer = timer('\nImporting ' + title, true),
				read_timer = timer(),
				write_timer = timer();

			total_timer.start();

			var sequencer = sequential(),
				read_path = '',
				write_path = gtfs_path + '/stage/' + file_name + '.txt',
				first = true;

			read_timer.start();

			paths.forEach(function(path) {
				sequencer.add(add_path_sequence(first, path, file_name, write_path, model, columns));
				first = false;
			});

			sequencer.then(function() {
				read_timer.stop();

				write_timer.start('Writing bulk file to database ...');
				copy_to_database(write_path, model, columns, function() {
					read_timer.total('Time spent reading source files');
					write_timer.interval('Time spent writing to database', true);
					total_timer.interval(title + ' Import Complete! Total time', true, true, '-');
					resolve();
				}, function(err) {
					console.log('Error copying data to database', err);
					reject();
				});
			});
		});
	};

	return self;
}

module.exports = function(options) {
	return importer(options);
};