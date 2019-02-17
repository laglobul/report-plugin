import { injectable, inject } from "inversify";
import { types as CFTypes, CommandContext } from 'eris-command-framework';
import { Connection } from "typeorm";
import ConfirmCreator from "./ConfirmCreator";
import { Report } from "./interfaces";
import { Client } from "eris";
import Types from "./types";
import { AxiosInstance } from "axios";

@injectable()
export default class ReportConfirmFactory {
  public constructor(
    @inject(CFTypes.connection) private connection: Connection,
    @inject(CFTypes.discordClient) private client : Client,
    @inject(Types.api.client) private api         : AxiosInstance
  ) {}

  public create(report: Report, context: CommandContext) {
    return new ConfirmCreator(report, context, this.connection, this.client, this.api)
  }
}
