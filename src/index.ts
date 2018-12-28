import {AxiosInstance, default as axios} from 'axios';
import {Message, TextableChannel} from 'eris';
import {AbstractPlugin} from 'eris-command-framework';
import Decorator from 'eris-command-framework/Decorator';
import Embed from 'eris-command-framework/Model/Embed';
import {Express} from 'express';
import {Container, inject, injectable} from 'inversify';
import ReportMessage from './Entity/ReportMessage';

import * as interfaces from './interfaces';
import Report from './Model/Report';
import ReportCreator from './ReportCreator';
import ReportCreatorFactory from './ReportCreatorFactory';
import Types from './types';

@injectable()
export default class ReportPlugin extends AbstractPlugin {
    public static Config: interfaces.Config;

    public static async addToContainer(container: Container, types: any): Promise<void> {
        const apiKey = await container.get<any>(types.vault.client).getSecret('bot/api', 'key');
        container.bind<string>(Types.api.url).toConstantValue(this.Config.apiUrl || 'https://api.hotline.gg/');
        container.bind<AxiosInstance>(Types.api.client).toDynamicValue((ctx) => axios.create({
            baseURL: ctx.container.get(Types.api.url),
            timeout: 5000,
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Accepts':       'application/json',
                'Content-Type':  'application/json',
            },
        }));
        container.bind<ReportCreatorFactory>(Types.factory.interactiveReport).to(ReportCreatorFactory);
        container.bind<Express>(Types.webserver).toService(types.webserver);
    }

    public static getEntities(): any[] {
        return [ReportMessage];
    }

    private reportConversations: { [key: string]: ReportCreator } = {};

    @inject(Types.api.client)
    private api: AxiosInstance;

    @inject(Types.webserver)
    private webserver: Express;

    @inject(Types.factory.interactiveReport)
    private reportCreatorFactory: ReportCreatorFactory;

    public async initialize(): Promise<void> {

        // @TODO Move this logic into its own service.
        const reportMessageRepo = this.getRepository<ReportMessage>(ReportMessage);
        const guild = this.client.guilds.get(ReportPlugin.Config.hotlineGuildId);
        for (const url of Object.keys(ReportPlugin.Config.subscriptions)) {
            const channelId = ReportPlugin.Config.subscriptions[url];
            const channel: TextableChannel = guild.channels.get(channelId) as TextableChannel;

            this.webserver.post('/subscription/' + channelId, async (req, res) => {
                let message: Message;
                let reportMessage: ReportMessage;
                const embed = await this.createReportEmbed(req.body.report);
                if (req.body.action === 'edit') {
                    reportMessage = await reportMessageRepo.findOne({reportId: req.body.report.id});
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

                message                 = await channel.createMessage({embed: embed.serialize()});
                if (!reportMessage) {
                    reportMessage           = new ReportMessage();
                    reportMessage.reportId  = req.body.report.id;
                    reportMessage.guildId   = guild.id;
                    reportMessage.channelId = channel.id;
                    reportMessage.insertDate = new Date();
                    reportMessage.updateDate = new Date();
                }
                reportMessage.messageId = message.id;
                await reportMessage.save();

                return res.send(204);
            });
        }
    }

    @Decorator.Command('report get', 'Gets a report')
    @Decorator.Alias('show', 'show report')
    @Decorator.Permission('report.show')
    public async GetCommand(id: number): Promise<void> {
        const report = (await this.api.get<interfaces.Report>('/report/' + id)).data;
        const embed  = await this.createReportEmbed(report);

        return this.sendEmbed(embed);
    }

    @Decorator.Command('report close', 'Closes an open report')
    @Decorator.Permission('report.close')
    public async CloseReportCommand(): Promise<void> {
        const report = this.reportConversations[this.context.user.id];
        if (!report) {
            return this.reactOk();
        }

        await report.close(false);
        delete this.reportConversations[this.context.user.id];

        return this.reactOk();
    }

    @Decorator.Command(
        'report create',
        'Creates a report',
        'If reason or tags aren\'t passed, this command becomes interactive, and will ask you to fill out the report.',
    )
    @Decorator.Alias('report')
    @Decorator.Permission('report.create')
    public async CreateCommand(@Decorator.Remainder() content: string = null): Promise<void> {
        const init: Partial<Report> = {};
        if (content !== null) {
            // Some shitty logic here. Feel free to clean this up

            // Split the content on |
            const splitContent = content.toString().split('|');

            // Grab all the user ids in the first section
            const userIds = splitContent.shift().match(/(\d+)/g);
            // If there are none, the command is probably malformed
            if (userIds.length === 0) {
                // tslint:disable-next-line
                return await this.reply(
                    'Malformed message. Format is: `report ...user_ids | Links?: ...links | Reason?: reason | Tags?: ...tags');
            }
            init.reportedUsers = userIds;

            // Loop through all the sections
            for (const section of splitContent) {
                if (/Links:\s+/i.test(section)) {
                    init.links = section.replace(/Links:\s+/i, '').split(' ');
                }

                if (/Reason:\s/.test(section)) {
                    init.reason = section.replace(/Reason:\s+/i, '').trim();
                }

                if (/Tags:\s/.test(section)) {
                    init.tags = section.replace(/Tags:\s+/i, '').split(' ').map((x) => parseInt(x, 10));
                }
            }
        }

        if (this.reportConversations[this.context.user.id]) {
            return this.reply(
                'You already have an open report. Please finish or close that one before creating another one.',
            );
        }

        this.reportConversations[this.context.user.id] = this.reportCreatorFactory.create(
            this.context,
            init,
        );
        this.reportConversations[this.context.user.id].on('close', () => {
            delete this.reportConversations[this.context.user.id];
        });
    }

    @Decorator.Command('tag create', 'Creates a tag')
    @Decorator.Permission('tag.create')
    public async CreateTagCommand(category: number, @Decorator.Remainder() name: string): Promise<void> {
        const message = await this.context.channel.createMessage('Creating Tag... Please wait.');
        await this.api.post<interfaces.Tag>('/tag', {name, category});

        await message.edit('Tag Created!');
    }

    @Decorator.Command('tag list', 'Lists tags')
    @Decorator.Alias('tags')
    public async ListTagCommand(category: number = null): Promise<void> {
        const message = await this.context.channel.createMessage('Fetching Tag... Please wait.');
        try {
            let url = '/tag';
            if (category !== null) {
                url += '?category=' + category;
            }
            const categories: { [category: string]: interfaces.Tag[] } = {};

            const tags = await this.api.get<{ count: number, results: interfaces.Tag[] }>(url);
            if (tags.data.count === 0) {
                await message.edit('There are no tags matching your query.');

                return;
            }

            for (const tag of tags.data.results) {
                if (!categories[tag.category.name]) {
                    categories[tag.category.name] = [];
                }
                categories[tag.category.name].push(tag);
            }

            let content = '';
            for (const cat of Object.keys(categories)) {
                content += `**${cat}:**\n`;
                for (const tag of categories[cat]) {
                    content += `    ${tag.id}) ${tag.name}\n`;
                }
            }

            await message.edit(content);
        } catch (e) {
            this.logger.error('Error fetching tags: %s', e.message);

            await message.edit('There was an error fetching the tags.');
        }
    }

    @Decorator.Command('tag edit', 'Edit a tag')
    @Decorator.Permission('tag.edit')
    public async EditTagCommand(id: number, @Decorator.Remainder() name: string): Promise<void> {
        const message = await this.context.channel.createMessage('Editing Tag... Please wait.');
        try {
            await this.api.post('/tag/' + id, {name});

            await message.edit('Successfully edited tag: ' + id);
        } catch (e) {
            this.logger.error('Error fetching tags: %s', e.message);

            await message.edit('There was an error editing the tag.');
        }
    }

    @Decorator.Command('tag delete', 'Delete a tag')
    @Decorator.Permission('tag.delete')
    public async DeleteTagCommand(id: number): Promise<void> {
        const message = await this.context.channel.createMessage('Deleting Tag... Please wait.');
        try {
            await this.api.delete('/tag/' + id);

            await message.edit('Successfully deleted tag: ' + id);
        } catch (e) {
            this.logger.error('Error fetching tags: %s', e.message);

            await message.edit('There was an error deleting the tag.');
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
};
