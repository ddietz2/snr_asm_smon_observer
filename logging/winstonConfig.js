const winston = require('winston');

module.exports = () => {
	const myFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
		return `${timestamp} ${level}: ${stack || message}`;
	});

	const transports = [
		new winston.transports.Console({
			level: 'debug',
			format: winston.format.combine(winston.format.simple(), myFormat),
		}),
	];

	if (process.env.FILE_LOGGING && JSON.parse(process.env.FILE_LOGGING)) {
		transports.push(
			new winston.transports.File({
				level: process.env.WINSTON_LOG_LEVEL || 'debug',
				maxsize: 10 * 1024 * 1024,
				maxFiles: 50,
				tailable: true,
				filename: '/logs/observer.log',
				format: winston.format.combine(winston.format.simple(), myFormat),
			})
		);
	}

	const logger = winston.createLogger({
		level: 'debug',
		format: winston.format.combine(
			winston.format.timestamp({
				format: 'DD-MM-YYYY HH:mm:ss.SSS',
			}),
			// winston.format.timestamp(),
			winston.format.errors({ stack: true })
		),
		transports: transports,
	});

	winston.add(logger);
};
