import {AxiosInstance, default as axios} from 'axios';
import {AbstractPlugin} from 'eris-command-framework';
import Decorator from 'eris-command-framework/Decorator';
import {Container, inject, injectable} from 'inversify';
import InteractiveReport from './InteractiveReport';
import InteractiveReportFactory from './InteractiveReportFactory';

import * as interfaces from './interfaces';
import Report from './Model/Report';
import Types from './types';

@injectable()
export default class ReportPlugin extends AbstractPlugin {
    public static Config: interfaces.Config;

    public static async addToContainer(container: Container, types: any): Promise<void> {
        const apiKey = await container.get<any>(types.vault.client).getSecret('bot/api', 'key');
        container.bind<string>(Types.report.api.url).toConstantValue('https://api.hotline.gg/');
        container.bind<AxiosInstance>(Types.report.api.client).toDynamicValue((ctx) => axios.create({
            baseURL: ctx.container.get(Types.report.api.url),
            timeout: 5000,
            headers: {
                'Authorization': 'Bearer ' + apiKey,
                'Accepts':       'application/json',
                'Content-Type':  'application/json',
            },
        }));
        container.bind<InteractiveReportFactory>(Types.report.factory.interactiveReport).to(InteractiveReportFactory);
    }

    public static getEntities(): any[] {
        return [];
    }

    private reportConversations: { [key: string]: InteractiveReport } = {};

    @inject(Types.report.api.client)
    private api: AxiosInstance;

    @inject(Types.report.factory.interactiveReport)
    private interactiveReportFactory: InteractiveReportFactory;

    @Decorator.Command('report', 'Creates a report')
    @Decorator.Alias('create report')
    public async CreateCommand(): Promise<void> {
        if (this.reportConversations[this.context.user.id]) {
            return this.reply(
                'You already have an open report. Please finish or close that one before creating another one.',
            );
        }

        const report    = new Report();
        report.reporter = this.context.user.id;
        if (this.context.guild && this.context.guild.id !== ReportPlugin.Config.hotlineGuildId) {
            report.guildId = this.context.guild.id;
        }

        this.reportConversations[this.context.user.id] = this.interactiveReportFactory.create(this.context);
        this.reportConversations[this.context.user.id].on('close', () => {
            delete this.reportConversations[this.context.user.id];
        });
    }

    @Decorator.Command('get report', 'Gets a report')
    // @Decorator.Permission() @todo Allow for passing in eris permission constants
    public async GetCommand(id: number): Promise<void> {
        const report        = (await this.api.get<interfaces.Report>('/report/' + id)).data;
        const reporter      = this.client.users.get(report.reporter.id);
        const reportedUsers = report.reportedUsers.map((x) => `<@${x.id}> (${x.id})`);
        const links         = report.links.map((x) => `<${x}>`);
        const tags          = report.tags.map((x) => x.name);

        return this.embedMessage((x) => {
            x.author      = {name: `Report ID: ${id}`};
            x.description = `**Users:** ${reportedUsers.join(', ')}
            
**Reason:** ${report.reason}

**Links:** ${links.length === 0 ? 'None' : links.join('\n')}

**Tags:** ${tags.length === 0 ? 'None' : tags.join(',t')}`;
            x.footer      = {
                text: `Reporter: ${reporter.username}#${reporter.discriminator}` +
                      ` | Confirmations: ${report.confirmationUsers.length}`,
            };
        });
    }
};
