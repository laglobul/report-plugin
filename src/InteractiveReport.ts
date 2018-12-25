import {Client, Message, PrivateChannel, TextableChannel} from 'eris';
import CommandContext from 'eris-command-framework/CommandContext';
import {EventEmitter} from 'events';
import {Connection} from 'typeorm';
import {Logger} from 'winston';
import Report from './Model/Report';

enum Step {
    START,
    REPORTED_USERS,
    REASON,
    LINKS,
    TAGS,
    FINISHED,
}

export default class InteractiveReport extends EventEmitter {
    private report: Report = new Report();

    private dm: PrivateChannel | TextableChannel;

    private step: Step = Step.START;

    private timeout: NodeJS.Timeout;

    constructor(
        private client: Client,
        // @ts-ignore
        private logger: Logger,
        // @ts-ignore
        private database: Connection,
        private context: CommandContext,
        init?: Partial<Report>,
    ) {
        super();

        if (init) {
            Object.assign(this.report, init);
        }

        this.initialize();
    }

    private setInactiveTimeout() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        this.timeout = setTimeout(
            async () => {
                await this.dm.createMessage('Seems like you forgot about this. Closing out your report.');
                this.emit('close');
            },
            10 * 60 * 1000,
        );
    }

    private async initialize(): Promise<void> {
        this.dm = await this.context.user.getDMChannel();
        this.setUpReplyListener();

        await this.next();
    }

    private async next() {
        this.step = this.getCurrentStep();
        await this.askQuestion();
        this.setInactiveTimeout();
    }

    private async askQuestion(): Promise<void> {
        switch (this.step) {
            case Step.REPORTED_USERS:
                await this.dm.createMessage(
                    'Who would you like to report? Please provide user ids or mentions',
                );
                this.once('messageReply', this.setReportedUsers.bind(this));
                break;
            case Step.REASON:
                await this.dm.createMessage(
                    'What are you reporting them for?',
                );
                this.once('messageReply', this.setReportReason.bind(this));
            default:
                break;
        }
    }

    private async setReportedUsers(message: Message): Promise<void> {
        this.report.reportedUsers = [...new Set(message.content.match(/(\d+)/gm))];

        await this.next();
    }

    private async setReportReason(message: Message): Promise<void> {
        this.report.reason = message.content;

        await this.next();
    }

    private getCurrentStep(): Step {
        if (!this.report.reportedUsers || this.report.reportedUsers.length === 0) {
            return Step.REPORTED_USERS;
        }

        if (!this.report.reason) {
            return Step.REASON;
        }

        if (!this.report.links || this.report.links.length === 0) {
            return Step.LINKS;
        }

        if (!this.report.tags || this.report.tags.length === 0) {
            return Step.TAGS;
        }

        return Step.FINISHED;
    }

    private setUpReplyListener() {
        this.client.on('messageCreate', (message: Message) => {
            if (message.author.id === this.context.user.id && message.channel.id === this.dm.id) {
                this.emit('messageReply', message);
            }
        });
    }
}
