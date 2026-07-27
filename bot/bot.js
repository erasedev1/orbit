const fs = require('node:fs');
const path = require('node:path');
const canvaslib = require("@napi-rs/canvas")
const { Client, Collection, Events, Partials, GatewayIntentBits, MessageFlags, AttachmentBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const client = new Client({intents: [GatewayIntentBits.Guilds]});
require('dotenv').config();

const N=[6,12,18,24];
const SPOKES = [[0,1,2,3,4,5], [0,2,4,6,8,10], [0,3,6,9,12,15], [0,4,8,12,16,20]]
const BANDS=[[48,104],[104,160],[160,216],[216,270]];
const C=300
const PATTERNS=[[1,0,2],[2,1,3],[0,1,2],[3,2,1]];

client.commands = new Collection();
client.games = {};
client.gamesids = [];
client.images = {};
client.generateboard = async (game) => {
	const canvas = canvaslib.createCanvas(600, 600);
	const context = canvas.getContext("2d");
	context.drawImage(client.images.background, 0, 0, canvas.width, canvas.height);
	if(game.turn == 1) {
		if(game.board[3][0] == 0) drawspawn(context, '#f4b429', 3, 0);
		if(game.board[3][12] == 0) drawspawn(context, '#f4b429', 3, 12);
	} else {
		if(game.board[3][4] == 0) drawspawn(context, '#38d0d6', 3, 4);
		if(game.board[3][16] == 0) drawspawn(context, '#38d0d6', 3, 16);
	}

	game.board.forEach((ring, i) => {
		ring.forEach((moon, e) => {
			if(moon != 0) {
				let coords = cellCenter(i,e);
				context.drawImage(client.images['p' + moon], coords[0]-13, coords[1]-13, 26, 26);
			}
		})
	})
	let moon = game['p'+game.turn].moons[game['p'+game.turn].select]
	if(moon && moon[0] == 1) {
		let coords = cellCenter(moon[1],moon[2]);
		context.lineWidth = 3
		context.strokeStyle = '#00ff0d'
		context.setLineDash([]);
		context.beginPath();
		context.ellipse(coords[0], coords[1], 12.5, 12.5, 0, 0, 2*Math.PI, true);
		context.closePath();
		context.stroke();
	}
	const attachment = new AttachmentBuilder(await canvas.encode('png'), { name: 'image.png' });
	return [attachment]
}
client.generatecomponents = (game, start = false) => {
	let player = game['p' + game.turn]
	const row1 = new ActionRowBuilder()
	const row2 = new ActionRowBuilder()
	const row3 = new ActionRowBuilder()
	const row4 = new ActionRowBuilder()
	const row5 = new ActionRowBuilder()
	for(let i = 1; i<5; i++) {
		const ring = new ButtonBuilder().setCustomId(`r${i}cw|${game.id}`).setLabel(`Ring ${i} CW`).setStyle(ButtonStyle.Primary);
		if(player.rotated || start) ring.setDisabled().setStyle(ButtonStyle.Secondary);
		else if(game.last_moved_ring && game.last_moved_ring[0] == i-1 && !game.last_moved_ring[1] && game.last_moved_ring[2] != game.turn) ring.setDisabled().setStyle(ButtonStyle.Secondary);
		row1.addComponents(ring);
	}
	for(let i = 1; i<5; i++) {
		const ring = new ButtonBuilder().setCustomId(`r${i}ccw|${game.id}`).setLabel(`Ring ${i} CCW`).setStyle(ButtonStyle.Primary);
		if(player.rotated || start) ring.setDisabled().setStyle(ButtonStyle.Secondary);
		else if(game.last_moved_ring && game.last_moved_ring[0] == i-1 && game.last_moved_ring[1] && game.last_moved_ring[2] != game.turn) ring.setDisabled().setStyle(ButtonStyle.Secondary);
		row2.addComponents(ring);
	}
	for(let i = 1; i<9; i++) {
		const moon = new ButtonBuilder().setCustomId(`m${i}|${game.id}`).setLabel(`Moon ${i}`).setStyle(ButtonStyle.Primary);
		if(!player.moons[i]) moon.setDisabled().setStyle(ButtonStyle.Secondary);
		if(player.moons[i] && player.moons[i][0] == 0) moon.setDisabled().setStyle(ButtonStyle.Danger);
		if(i < 5) row3.addComponents(moon);
		if(i > 4) row4.addComponents(moon);
	}
	const spawn1 = new ButtonBuilder().setCustomId(`spawnt|${game.id}`).setLabel('Spawn Moon Top').setStyle(ButtonStyle.Success);
	if(game.board[3][game.turn == 1 ? 0 : 4] != 0 || player.rotated) spawn1.setDisabled().setStyle(ButtonStyle.Secondary);
	const spawn2 = new ButtonBuilder().setCustomId(`spawnb|${game.id}`).setLabel('Spawn Moon Bottom').setStyle(ButtonStyle.Success);
	if(game.board[3][game.turn == 1 ? 12 : 16] != 0 || player.rotated) spawn2.setDisabled().setStyle(ButtonStyle.Secondary);
	row3.addComponents(spawn1)
	row4.addComponents(spawn2)
	const push = new ButtonBuilder().setCustomId(`push|${game.id}`).setLabel(`Push Moon`).setStyle(ButtonStyle.Success);
	const pull = new ButtonBuilder().setCustomId(`pull|${game.id}`).setLabel(`Pull Moon`).setStyle(ButtonStyle.Success);
	const cw = new ButtonBuilder().setCustomId(`cw|${game.id}`).setLabel(`Move Moon CW`).setStyle(ButtonStyle.Success);
	const ccw = new ButtonBuilder().setCustomId(`ccw|${game.id}`).setLabel(`Move Moon CCW`).setStyle(ButtonStyle.Success);
	const skip = new ButtonBuilder().setCustomId(`skip|${game.id}`).setLabel(`Skip Movement`).setStyle(ButtonStyle.Success);
	if(player.select == 0) {
		push.setDisabled().setStyle(ButtonStyle.Secondary);
		pull.setDisabled().setStyle(ButtonStyle.Secondary);
		cw.setDisabled().setStyle(ButtonStyle.Secondary);
		ccw.setDisabled().setStyle(ButtonStyle.Secondary);
	} else {
		let moon = player.moons[player.select]
		if(!SPOKES[moon[1]].includes(moon[2])) {
			push.setDisabled().setStyle(ButtonStyle.Secondary);
			pull.setDisabled().setStyle(ButtonStyle.Secondary);
		}
		if(moon[1] == 0 || game.board[moon[1]-1][SPOKES[moon[1]-1][SPOKES[moon[1]].indexOf(moon[2])]] != 0) push.setDisabled().setStyle(ButtonStyle.Secondary);
		if(moon[1] == 3 || game.board[moon[1]+1][SPOKES[moon[1]+1][SPOKES[moon[1]].indexOf(moon[2])]] != 0) pull.setDisabled().setStyle(ButtonStyle.Secondary);
		if(game.board[moon[1]][moon[2] + 1 >= N[moon[1]] ? 0 : moon[2] + 1] != 0) cw.setDisabled().setStyle(ButtonStyle.Secondary);
		if(game.board[moon[1]][moon[2] - 1 < 0 ? N[moon[1]] - 1 : moon[2] - 1] != 0) ccw.setDisabled().setStyle(ButtonStyle.Secondary);
	}
	if(!player.rotated) skip.setDisabled().setStyle(ButtonStyle.Secondary);
	row5.addComponents([push, pull, cw, ccw, skip])
	return [row1, row2, row3, row4, row5]
}
client.checkcapture = (game) => {
	for(let i = 0; i < 6; i++) {
		for(const [v,f1,f2] of PATTERNS){
			if(
				game.board[v][SPOKES[v][i]] != 0 && 
				game.board[f1][SPOKES[f1][i]] != 0 && 
				game.board[v][SPOKES[v][i]] != game.board[f1][SPOKES[f1][i]] && 
				game.board[v][SPOKES[v][i]] != game.board[f2][SPOKES[f2][i]] && 
				game.board[f1][SPOKES[f1][i]] == game.board[f2][SPOKES[f2][i]]
			) {
                let player = game['p'+game.board[v][SPOKES[v][i]]]
				let moon = player.moons.filter(function(e){if(e && e[1] == v && e[2] == SPOKES[v][i]) return e})[0];
				player.moons[player.moons.indexOf(moon)] = [0,0,0]
				game.board[v][SPOKES[v][i]] = 0
				game['p'+game.board[f1][SPOKES[v][i]]].capture += 1
			}
		}
	}
}
client.checkwin = (game) => {
	for(let i=1; i<3; i++) {
		if(game['p'+i].capture >= 3) {
			return 'p'+i
		} else {
			return false
		}
	}
}

function pt(deg,R){const a=deg*Math.PI/180;return [C+R*Math.sin(a), C-R*Math.cos(a)];}
function cellCenter(r,i){const step=360/N[r],[ri,ro]=BANDS[r];return pt(i*step,(ri+ro)/2);}
function drawspawn(context, c, r, i) {
    let coords = cellCenter(r,i)
    context.lineWidth = 3
    context.strokeStyle = c
    context.setLineDash([4]);
    context.beginPath()
    context.ellipse(coords[0], coords[1], 12.5, 12.5, 0, 0, 2*Math.PI, true);
    context.closePath()
    context.stroke()
}

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

client.on(Events.InteractionCreate, async (interaction) => {
	if (interaction.isChatInputCommand()) {
		const command = interaction.client.commands.get(interaction.commandName);
		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}
		try {
			await command.execute(client, interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			} else {
				await interaction.reply({
					content: 'There was an error while executing this command!',
					flags: MessageFlags.Ephemeral,
				});
			}
		}
	} else if(interaction.isButton()) {
		if(interaction.customId.startsWith('spawn')) {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let i = interaction.customId.includes("t") ? game.turn == 1 ? 0 : 4 : game.turn == 1 ? 12 : 16
			if(game.board[3][i] != 0) return;
			game['p' + game.turn].moons.push([1,3,i])
			game.board[3][i] = game.turn
			await client.checkcapture(game);
			let win = await client.checkwin(game)
			if(win) {
				return interaction.update({content : `<@${game[win].id}> Won ${game[win].capture}-${game[win == 'p1' ? 'p2' : 'p1'].capture} to <@${game[win == 'p1' ? 'p2' : 'p1'].id}>`})
			}
			game.turn = game.turn == 1 ? 2 : 1
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn == 1 ? 2 : 1} placed a Moon. Player ${game.turn}'s turn`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		} else if(interaction.customId.startsWith('m')) {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let moonnum = Number(interaction.customId.charAt(1))
			let player = game['p' + game.turn]
			player.select = moonnum
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn} selected Moon ${moonnum}`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		} else if(interaction.customId.startsWith('r')) {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let ringnum = Number(interaction.customId.charAt(1))-1
			let ring = game.board[ringnum]
			let cw = interaction.customId.charAt(3) == 'w' ? true : false
			game.board[ringnum] = cw ? [ring[ring.length-1],...ring.slice(0,-1)] : [...ring.slice(1),ring[0]]
			game.p1.moons.forEach((moon, i) => {
				if(moon && moon[0] == 1 && moon[1] == ringnum) {
					if(cw) moon[2] = moon[2] + 1 >= N[ringnum] ? 0 : moon[2] + 1
					else moon[2] = moon[2] - 1 < 0 ? N[ringnum] - 1 : moon[2] - 1
					game.p1.moons[i][2] = moon[2]
				}
			})
			game.p2.moons.forEach((moon, i) => {
				if(moon && moon[0] == 1 && moon[1] == ringnum) {
					if(cw) moon[2] = moon[2] + 1 >= N[ringnum] ? 0 : moon[2] + 1
					else moon[2] = moon[2] - 1 < 0 ? N[ringnum] - 1 : moon[2] - 1
					game.p2.moons[i][2] = moon[2]
				}
			})
			game.last_moved_ring = [ringnum, cw, game.turn]
			game['p' + game.turn].rotated = true
			await client.checkcapture(game);
			let win = await client.checkwin(game)
			if(win) {
				return interaction.update({content : `<@${game[win].id}> Won ${game[win].capture}-${game[win == 'p1' ? 'p2' : 'p1'].capture} to <@${game[win == 'p1' ? 'p2' : 'p1'].id}>`})
			}
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn == 1 ? 2 : 1} rotated Ring ${ringnum} ${cw ? "Clockwise" : "Counter Clockwise"}. Player ${game.turn}'s turn`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		} else if(interaction.customId.startsWith('pu')) {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let push = interaction.customId == 'push' ? true : false
			let player = game['p' + game.turn]
			let moon = player.moons[player.select]
			let coords = [moon[1], moon[2]]
			game.board[moon[1]][moon[2]] = 0
			if(SPOKES[moon[1]].includes(moon[2]) && push && moon[1] != 0) moon[1] -= 1
			else if(SPOKES[moon[1]].includes(moon[2]) && !push && moon[1] <= 3) moon[1] += 1
			moon[2] = SPOKES[moon[1]][SPOKES[coords[0]].indexOf(coords[1])]
			game.board[coords[0]][coords[1]] = 0
			game.board[moon[1]][moon[2]] = game.turn
			await client.checkcapture(game);
			let win = await client.checkwin(game)
			if(win) {
				return interaction.update({content : `<@${game[win].id}> Won ${game[win].capture}-${game[win == 'p1' ? 'p2' : 'p1'].capture} to <@${game[win == 'p1' ? 'p2' : 'p1'].id}>`})
			}
			game.turn = game.turn == 1 ? 2 : 1
			player.select = 0
			game.p1.rotated = false
			game.p2.rotated = false
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn == 1 ? 2 : 1} ${push ? "pushed" : "pulled"} Moon ${player.moons.indexOf(moon)} to Ring ${moon[1]+1}. Player ${game.turn}'s turn`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		} else if(interaction.customId.startsWith('c')) {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let cw = interaction.customId == 'cw' ? true : false
			let player = game['p' + game.turn]
			let moon = player.moons[player.select]
			game.board[moon[1]][moon[2]] = 0
			if(cw && game.board[moon[1]][moon[2] + 1 >= N[moon[1]] ? 0 : moon[2] + 1] == 0) moon[2] + 1 >= N[moon[1]] ? 0 : moon[2] += 1;
			else if(!cw && game.board[moon[1]][moon[2] - 1 < 0 ? N[moon[1]] - 1 : moon[2] - 1] == 0) moon[2] - 1 < 0 ? N[moon[1]] - 1 : moon[2] -= 1
			game.board[moon[1]][moon[2]] = game.turn
			await client.checkcapture(game);
			let win = await client.checkwin(game)
			if(win) {
				return interaction.update({content : `<@${game[win].id}> Won ${game[win].capture}-${game[win == 'p1' ? 'p2' : 'p1'].capture} to <@${game[win == 'p1' ? 'p2' : 'p1'].id}>`})
			}
			game.turn = game.turn == 1 ? 2 : 1
			player.select = 0
			game.p1.rotated = false
			game.p2.rotated = false
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn == 1 ? 2 : 1} moved Moon ${player.moons.indexOf(moon)} ${cw ? "Clockwise" : "Counter Clockwise"}. Player ${game.turn}'s turn`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		} else if(interaction.customId == 'skip') {
			let game = client.games[interaction.customId.split('|')[1]]
			if(interaction.user.id != game['p'+game.turn].id) return interaction.reply({content:'wait for your goddamn turn', flags: MessageFlags.Ephemeral})
			let player = game['p' + game.turn]
			await client.checkcapture(game);
			let win = await client.checkwin(game)
			if(win) {
				return interaction.update({content : `<@${game[win].id}> Won ${game[win].capture}-${game[win == 'p1' ? 'p2' : 'p1'].capture} to <@${game[win == 'p1' ? 'p2' : 'p1'].id}>`})
			}
			game.turn = game.turn == 1 ? 2 : 1
			player.select = 0
			game.p1.rotated = false
			game.p2.rotated = false
			game.last_moved = Date.now();
			interaction.update({content: `<@${game.p1.id}> ${game.p1.capture}-${game.p2.capture} <@${game.p2.id}> | Player ${game.turn == 1 ? 2 : 1} skiped moving. Player ${game.turn}'s turn`, files:await client.generateboard(game), components: await client.generatecomponents(game)});
		}
	}
});

client.once(Events.ClientReady, async (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
	client.images.background = await canvaslib.loadImage('bot/bg.png');
	client.images.p1 = await canvaslib.loadImage('bot/p1.png');
	client.images.p2 = await canvaslib.loadImage('bot/p2.png');
	setInterval(async () => {
		Object.values(client.games).forEach(async (game) => {
			if(Date.now() - game.last_moved >= 300000) {
				delete client.games[game.id]
				client.gamesids.splice(client.gamesids.indexOf(game.id),1) 
				let message = await client.channels.cache.get(game.channel).messages.fetch(game.message)
				message.edit({content:`Draw due to inactivity`, files: [], components: []})
			}
		})
	}, 300000);
});

client.login(process.env.TOKEN);
