import {Client} from 'eris';
import {CommandContext, types as CFTypes} from 'eris-command-framework';
import {inject, injectable} from 'inversify';
import {Connection} from 'typeorm';
import {Logger} from 'winston';

import InteractiveReport from './InteractiveReport';
import Report from './Model/Report';

@injectable()
export default class InteractiveReportFactory {
    public constructor(
        @inject(CFTypes.discordClient) private client: Client,
        @inject(CFTypes.logger) private logger: Logger,
        @inject(CFTypes.connection) private database: Connection,
    ) {
    }

    public create(context: CommandContext, init?: Partial<Report>): InteractiveReport {
        return new InteractiveReport(this.client, this.logger, this.database, context, init);
    }
}
