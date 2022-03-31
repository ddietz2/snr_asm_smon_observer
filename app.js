const winston = require('winston');
const cron = require('node-cron');
require('./logging/winstonConfig')();

try {
	// process.on('warning', (e) => console.warn(e.stack));
	const SCHEDULE = process.env.SCHEDULE || '0 */2 * * *';
	winston.info('Scheduling smon rest observer according to cron schedule: ' + SCHEDULE);
	cron.schedule(process.env.SCHEDULE || '0 */2 * * *', () => {
		require('./cronTask')();
	});
} catch (error) {
	winston.error(error);
}
