import {Client, Guild, Message, TextableChannel} from 'eris';
import {types as CFTypes} from 'eris-command-framework';
import Embed from 'eris-command-framework/Model/Embed';
import {Express} from 'express';
import {inject, injectable} from 'inversify';
import {Connection, Repository} from 'typeorm';

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
        @inject(CFTypes.connection) private database: Connection,
        @inject(CFTypes.discordClient) private client: Client,
    ) {
        this.reportMessageRepo = this.database.getRepository<ReportMessage>(ReportMessage);
    }

    public async initialize() {
        this.guild = this.client.guilds.get(ReportPlugin.Config.hotlineGuildId);

        for (const channelId of ReportPlugin.Config.subscriptions) {
            const channel: TextableChannel = this.guild.channels.get(channelId) as TextableChannel;

            this.webserver.post('/subscription/' + channelId, async (req, res) => {
                let message: Message;
                let reportMessage: ReportMessage;
                const embed = await this.createReportEmbed(req.body.report);
                if (req.body.action === 'edit') {
                    reportMessage = await this.reportMessageRepo.findOne({reportId: req.body.report.id});
                    if (reportMessage) {
                        message = await channel.getMessage(reportMessage.messageId);
                        if (message) {
                            await message.edit({embed: embed.serialize()});
                            reportMessage.updateDate = new Date();
                            await reportMessage.save();

                            return res.send(204);
                        }
                    }
                }

                message = await channel.createMessage({embed: embed.serialize()});
                if (!reportMessage) {
                    reportMessage            = new ReportMessage();
                    reportMessage.reportId   = req.body.report.id;
                    reportMessage.guildId    = this.guild.id;
                    reportMessage.channelId  = channel.id;
                    reportMessage.insertDate = new Date();
                    reportMessage.updateDate = new Date();
                }
                reportMessage.messageId = message.id;
                await reportMessage.save();

                return res.send(204);
            });
        }
    }

    private async createReportEmbed(report: interfaces.Report): Promise<Embed> {
        const reporter      = this.client.users.get(report.reporter.id);
        const reportedUsers = report.reportedUsers.map((x) => `<@${x.id}> (${x.id})`);
        const links         = report.links.map((x) => `<${x}>`);
        const tags          = report.tags.map((x) => x.name);

        const embed = new Embed();

        embed.author      = {name: `Report ID: ${report.id}`};
        embed.description = `**Users:** ${reportedUsers.join(', ')}
        
**Reason:** ${report.reason}

**Links:** ${links.length === 0 ? 'None' : links.join('\n')}

**Tags:** ${tags.length === 0 ? 'None' : tags.join(',t')}`;
        embed.footer      = {
            text: `Reporter: ${reporter.username}#${reporter.discriminator}` +
                  ` | Confirmations: ${report.confirmationUsers.length}`,
        };

        return embed;
    }
}
