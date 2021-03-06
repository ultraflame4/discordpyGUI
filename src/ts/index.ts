
import {app, BrowserWindow, ipcMain} from "electron"
import * as prompt from 'electron-prompt'
import path = require('path')
import moment = require("moment")

import Discord = require("discord.js");
import {GuildChannel, TextChannel} from "discord.js";

const client = new Discord.Client();
var win = null;

var botReady = false

function createWindow() {

    win = new BrowserWindow(
        {
            width: 1000,
            height: 600,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js')
            }
        }
    )
    win.setMenu(null)

    win.loadFile(path.join(__dirname,"../gui/index.html"))

    ipcMain.on("devtools", () => {
        win.webContents.toggleDevTools()
    })

    ipcMain.on("reload",()=>{
        console.log("Reload disabled due to issues.")
        // win.reload()
    })



    ipcMain.on("LoginRequest", login_request_callback)



    // Send chat text input listener
    ipcMain.on("textinput-send",(e,text_input,channelId)=>{
        if (channelId===null){
            console.log("No channel open")
            return
        }
        console.log("Sending ",text_input,"to ",channelId)
        client.channels.fetch(channelId).then((channel:Discord.TextChannel)=>{
            channel.send(text_input).catch((reason)=>{
                console.log("Error sending message")
                console.log(reason)
            })
        })

    })




    // Requests to open content listeners

    ipcMain.on("requestOpenGuildContent", (e, guild_id) => {
        if (guild_id === "home") { //check if user is opening the "home"
            e.sender.send("openHomeContent"); // if opening home, send required data for home
            return
        }

        client.guilds.fetch(guild_id).then((guild) => {
            e.sender.send("openGuildContent", guild.id, guild.name); // Send back a signal with required data

        })

    })


    ipcMain.on("requestOpenChannelContent", (e, channelId) => {
        client.channels.fetch(channelId).then((channel:Discord.GuildChannel) => {
            e.sender.send("openChannelContent", channel.id, channel.name)
        })

    })

    // Populate content listeners
    ipcMain.on("populateGuildChannel", (e, guildId) => {

        // Loop through guild channels and add them tto sidebar
        client.guilds.fetch(guildId).then((guild) => {
            guild.channels.cache.forEach((channel:GuildChannel)=>{
                // Skip category and voice channels for now. todo add support for categories and voice
                if (channel.type === "category" || channel.type === "voice") {
                    return
                }

                // skip deleted channels
                if (channel.deleted === true) {
                    return;
                }
                e.sender.send("addGuildChannel", channel.id, channel.name)
            })

        })
    })

    ipcMain.on("populateChannelChat", (e, channelId) => {
        client.channels.fetch(channelId).then((channel:TextChannel) => {
            if (channel.type != "text") {
                console.error("Error while populating channel chat: channel not of text type")
                return
            }

            channel.messages.fetch({limit: 50}).then((messages) => {
                messages.forEach((msg, msgId) => { // note: oldest text comes first.

                    let moment_date = moment(msg.createdAt)

                    // Format date to string
                    e.sender.send("addChatMessage", msg.content,
                        {id: msg.author.id, name: msg.author.username, avatarURL: msg.author.avatarURL()},
                        {date:msg.createdAt,string:moment_date.calendar(),timestamp:moment_date.unix()});
                })
            })


        })

    })

    ipcMain.on("populateMemberList",(e,guildId)=>{
        client.guilds.fetch(guildId).then((guild)=>{
            guild.members.cache.forEach((guildMember)=>{
                e.sender.send("addMember",{
                    id:guildMember.id,
                    username:guildMember.user.username,
                    avatarURL:guildMember.user.avatarURL(),
                    status : guildMember.user.presence.status

                })
            })
        })
    })


}


app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit()
        }
    })

})

app.on("before-quit", () => {
    // Logout of discord
    botReady=false
    client.destroy()
});


function login_request_callback() {
    win.webContents.send("loggedin", true); //prevent user from clicking button again

    prompt({
        title: "Discord Bot Login",
        label: "Token: ",
        type: "input",
        alwaysOnTop: true,
        skipTaskbar: false,
        inputAttrs: {
            type: "password",
            required: true
        }
    }).then(
        (r) => {
            if (r !== null) {
                win.webContents.send("loggedin", true);
                discordLogin(r)
            }
            else{
                win.webContents.send("loggedin", false)
            }
        }
    );

}

function discordLogin(token) {
    if (token === null) {
        return
    }

    client.login(token).catch((r) => {
        win.webContents.send("loggedin", false)
    });

}


function populateGuildList_(){
    client.guilds.cache.forEach((guild)=>{
        win.webContents.send("addGuild", guild.name, guild.id, guild.iconURL())
    })

}


client.on('ready', () => {
    botReady=true
    win.webContents.send("botready", client.user.username, client.user.avatarURL(), client.user.tag)


    populateGuildList_()

})

client.on('message',(msg)=>{
    console.log("new message!")
    let moment_date = moment(msg.createdAt)
    win.webContents.send("addChatMessage", msg.content,
        {id: msg.author.id, name: msg.author.username, avatarURL: msg.author.avatarURL()},
        {date:msg.createdAt,string:moment_date.calendar(),timestamp:moment_date.unix()},true);
})