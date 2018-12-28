import {BaseEntity, Column, Entity, PrimaryGeneratedColumn} from 'typeorm';

@Entity('report_message')
export default class ReportMessage extends BaseEntity {
    @PrimaryGeneratedColumn()
    public id: number;

    @Column({type: 'bigint'})
    public reportId: string;

    @Column({type: 'bigint'})
    public guildId: string;

    @Column({type: 'bigint'})
    public channelId: string;

    @Column({type: 'bigint'})
    public messageId: string;

    @Column({type: 'datetime'})
    public insertDate: Date = new Date();

    @Column({type: 'datetime'})
    public updateDate: Date = new Date();
}
