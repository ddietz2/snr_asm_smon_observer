const winston = require('winston');

module.exports = () => {
	const myFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
		return `${timestamp} ${level}: ${stack || message}`;
	});

	const logger = winston.createLogger({
		level: 'debug',
		format: winston.format.combine(
			winston.format.timestamp({
				format: 'DD-MM-YYYY HH:mm:ss.SSS',
			}),
			// winston.format.timestamp(),
			winston.format.errors({ stack: true })
		),
		transports: [
			new winston.transports.Console({
				level: 'debug',
				format: winston.format.combine(winston.format.simple(), myFormat),
			}),
			new winston.transports.File({
				level: process.env.WINSTON_LOG_LEVEL || 'debug',
				maxsize: 10 * 1024 * 1024,
				maxFiles: 50,
				tailable: true,
				filename: '/logs/winstonLog.log',
				format: winston.format.combine(winston.format.simple(), myFormat),
			}),
		],
	});

	winston.add(logger);
};
