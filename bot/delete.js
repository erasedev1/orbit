const { REST, Routes } = require('discord.js');
require('dotenv').config();

const rest = new REST().setToken(process.env.TOKEN);
// ...
// for guild-based commands
rest
	.delete(Routes.applicationGuildCommand('1530454843045445632', '1530454652183777420', 'cmd'))
	.then(() => console.log('Successfully deleted guild command'))
	.catch(console.error);
// for global commands
// rest
// 	.delete(Routes.applicationCommand('1530454843045445632', 'cmd'))
// 	.then(() => console.log('Successfully deleted application command'))
// 	.catch(console.error);