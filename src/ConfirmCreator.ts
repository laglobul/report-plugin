import { Report } from "./interfaces";
import { CommandContext } from 'eris-command-framework';
import { Message, EmbedBase, Client } from "eris";
import { Repository, Connection } from "typeorm";
import Guild from "@hotline/application-plugin/Entity/Guild";
import { injectable } from "inversify";
import { AxiosInstance } from "axios";

const emojiNumbers = ['1⃣', '2⃣', '3⃣', '4⃣', '5⃣', '6⃣', '7⃣', '8⃣', '9⃣']

@injectable()
export default class ConfirmCreator {
  private confirmMessage: Message
  private guilds        : Guild[]
  private guildRepo     : Repository<Guild>

  constructor(
    public  report    : Report,
    public  context   : CommandContext,
    private connection: Connection,
    private client    : Client,
    private api       : AxiosInstance
  ) {
    // Temporary workaround because TypeORM™
    const guildEntity = this.connection.entityMetadatas.find(entity => entity.name === 'Guild').target

    this.guildRepo = this.connection.getRepository(guildEntity)
    this.initialize()
  }

  private async initialize() {
    this.confirmMessage = await this.context.channel.createMessage('_Fetching information_')

    const member       = this.context.member
    const hotlineGuild = this.context.guild
    const dividerRole  = hotlineGuild.roles.get('204103172682153984')

    const allServerRoles = hotlineGuild.roles.filter(role => role.position < dividerRole.position && role.id !== hotlineGuild.id)
    let   memberServers  = allServerRoles.filter(role => member.roles.includes(role.id))

    this.guilds = await Promise.all(memberServers.map(async (serverRole) => {
      const guild = await this.guildRepo.findOne({
        where: {
          roleId: serverRole.id
        }
      })

      return guild
    }))
    this.guilds.sort((a, b) => a.name.localeCompare(b.name))

    await this.updateConfirmMessage()
    this.listenForReactions()
  }

  private listenForReactions() {
    this.client.on('messageReactionAdd', async (message, emoji, userId) => {
      if (message.id !== this.confirmMessage.id || userId === this.client.user.id) {
        return
      }

      const choiceNumber = emojiNumbers.indexOf(emoji.name)
      if (choiceNumber === -1) {
        const emojiId = emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name

        await this.confirmMessage.removeReaction(emojiId, userId)
        return
      }

      const chosenGuild = this.guilds[choiceNumber]
      const member = this.context.guild.members.get(userId)
      if (!member.roles.includes(chosenGuild.roleId) || !chosenGuild) {
        return
      }

      return this.confirmReport(userId, chosenGuild)
    })
  }

  // @ts-ignore
  private async confirmReport(userId: string, guild: Guild) {
    const userMention = `<@${userId}>`
    const textChannel = this.context.channel
    const confirmUrl  = `/report/${this.report.id}/confirm`

    try {
      await this.api.post(confirmUrl, {
        guild    : guild.guildId,
        user     : userId,
        confirmed: true
      })

      return textChannel.createMessage(`${userMention} you have now confirmed report ${this.report.id} on behalf of <@&${guild.roleId}>.`)
    } catch (e) {
      if (e.response && e.response.data && e.response.data.message === 'report already confirmed') {
        return textChannel.createMessage(`${userMention} this server has already confirmed report ${this.report.id}.`)
      }

      console.error(e)
      return textChannel.createMessage(`${userMention} An unknown error has occured. If this still occurs after a while, notify an Hotline admin.`)
    
    }
  }

  public async updateConfirmMessage() {
    const issuer = this.context.user
    let embed: EmbedBase = {
      color      : 3447003,
      title      : `Confirm report ${this.report.id}`,
      description: 'On behalf of which server do you want to confirm this report?\n\n',
      footer: {
        text    : `Command issued by ${issuer.username}#${issuer.discriminator}`,
        icon_url: issuer.avatarURL
      }
    }

    for (let i = 0; i < 8; i++) {
      const guild = this.guilds[i]

      if (guild) {
        embed.description += `${emojiNumbers[i]} <@&${guild.roleId}>\n`
        this.confirmMessage.addReaction(emojiNumbers[i])
      } else {
        break
      }
    }

    if (this.guilds[9]) {
      embed.description += '\n_Support for showing more than 9 guilds will be added in the future_'
    }

    return this.confirmMessage.edit({
      content: '',
      embed
    })
  }
}