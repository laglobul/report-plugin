import {Client, Guild, Message, TextableChannel} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import Embed from 'eris-command-framework/Model/Embed';
import {Express} from 'express';
import {inject, injectable} from 'inversify';
import * as moment from 'moment';
import {Connection, Repository} from 'typeorm';
import {Logger} from 'winston';

import ReportMessage from '../Entity/ReportMessage';
import ReportPlugin from '../index';
import * as interfaces from '../interfaces';
import Types from '../types';

@injectable()
export default class WebhookListener {
    private reportMessageRepo: Repository<ReportMessage>;

    private guild: Guild;

    public constructor(
        @inject(Types.webserver) private webserver: Express,
        @inject(CFTypes.logger) private logger: Logger,
        @inject(CFTypes.connection) private database: Connection,
        @inject(CFTypes.discordClient) private client: Client,
    ) {
        this.reportMessageRepo = this.database.getRepository<ReportMessage>(ReportMessage);
    }

    public async initialize() {
        this.guild = this.client.guilds.get(ReportPlugin.Config.hotlineGuildId);
        if (!this.guild) {
            return this.logger.error(
                'Failed to initialize WebhookListener. Guild could not be found with the id: %s',
                ReportPlugin.Config.hotlineGuildId,
            );
        }

        for (const channelId of ReportPlugin.Config.subscriptions) {
            const channel: TextableChannel = this.guild.channels.get(channelId) as TextableChannel;

            this.webserver.post('/subscription/' + channelId, async (req, res) => {
                let message: Message;
                let reportMessage: ReportMessage;
                const report: interfaces.Report = JSON.parse(req.body.report);
                const embed                     = await this.createReportEmbed(report);
                if (req.body.action === 'edit') {
                    reportMessage = await this.reportMessageRepo.findOne({reportId: report.id});
                    if (reportMessage) {
                        message = await channel.getMessage(reportMessage.messageId);
                        if (message) {
                            await message.edit({embed: embed.serialize()});
                            reportMessage.updateDate = new Date();
                            await reportMessage.save();

                            return res.sendStatus(204);
                        }
                    }
                }

                if (req.body.action === 'delete') {
                    reportMessage = await this.reportMessageRepo.findOne({reportId: report.id});
                    if (reportMessage) {
                        message = await channel.getMessage(reportMessage.messageId);
                        if (message) {
                            await message.delete('Deleted Report');
                            reportMessage.updateDate = new Date();
                            await reportMessage.save();
                        }
                    }

                    return res.sendStatus(204);
                }

                message = await channel.createMessage({embed: embed.serialize()});
                if (!reportMessage) {
                    reportMessage            = new ReportMessage();
                    reportMessage.reportId   = report.id;
                    reportMessage.guildId    = this.guild.id;
                    reportMessage.channelId  = channel.id;
                    reportMessage.insertDate = new Date();
                    reportMessage.updateDate = new Date();
                }
                reportMessage.messageId = message.id;
                await reportMessage.save();

                return res.sendStatus(204);
            });
        }
    }

    private async createReportEmbed(report: interfaces.Report): Promise<Embed> {
        const reportedUsers = report.reportedUsers.map((x) => `<@${x.id}> (${x.id})`);
        const links         = report.links.map((x) => `<${x}>`);
        const tags          = report.tags.map((x) => x.name);

        let description = `**Users:** ${reportedUsers.join(', ')}`;
        if (report.reason) {
            description += `\n\n**Reason:** ${report.reason}`;
        }

        if (report.tags.length > 0) {
            description += `\n\n**Tags:** ${tags.length === 0 ? 'None' : tags.join(',t')}`;
        }

        if (report.links.length > 0) {
            description += `\n\n**Links:** ${links.length === 0 ? 'None' : links.join('\\n')}`;
        }

        const lastEdit   = moment(report.updateDate).from(moment());
        const footerText = `Confirmations: ${report.confirmationUsers.length} | Last Edit: ${lastEdit}`;

        const embed = new Embed();

        embed.author      = {name: `Report ID: ${report.id}`};
        embed.description = description;
        embed.footer      = {text: footerText};

        return embed;
    }
}
