const { SlashCommandBuilder, MessageFlags } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('orbit')
        .addUserOption((option) => option.setName('opponent').setDescription('Play against').setRequired(true)),
	async execute(client, interaction) {
        const target = interaction.options.getUser('opponent');
        if(target.id == interaction.user.id || target.bot) return interaction.reply({content: 'Not a valid opponent', flags: MessageFlags.Ephemeral})
        let random = Math.round(Math.random())
        let game = {
            id: generateid(client),
            turn: 1,
            last_moved_ring: null,
            last_moved: Date.now(),
            channel: '',
            message: '',
            p1: {
                id: random == 0 ? interaction.user.id : target.id,
                moons: [null],
                select: 0,
                rotated: false,
                capture: 0
            },
            p2: {
                id: random == 1 ? interaction.user.id : target.id,
                moons: [null],
                select: 0,
                rotated: false,
                capture: 0
            },
            board: [
                Array.from({length: 6}, () => (0)),
                Array.from({length: 12}, () => (0)),
                Array.from({length: 18}, () => (0)),
                Array.from({length: 24}, () => (0))
            ]
        }
		let message = await interaction.reply({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | <@${interaction.user.id}>'s Turn`, files:await client.generateboard(game), components: await client.generatecomponents(game, true), withResponse: true })
        game.message = message.resource.message.id
        game.channel = interaction.channel.id
        client.games.push(game)
        client.gamesids.push(game.id)
    },
};

function generateid(client) {
    var character = 'abcdefghijklmnopqrstuvwxyz1234567890';
    var id = '';
    for (let i = 0; i < 4; i++) {
        id += character.charAt(Math.floor(Math.random() * character.length));
    }
    if(client.gamesids.includes(id)) id = generateid()
    return id
}