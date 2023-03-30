const FS = require("fs");

const SteamUser = require("steam-user");
const XboxWebAPI = require("xbox-webapi");
const Config = require("./config.json");

// Main
var SteamClient = new SteamUser({ "dataDirectory": "./SteamData/", "singleSentryfile": true });
var XboxClient = XboxWebAPI({ clientId: Config.XboxAPI.clientId, clientSecret: Config.XboxAPI.clientSecret });

SteamClient.Apps = [];
XboxClient.LastTitleID = -1;

async function OnUpdate()
{
    let m_IsSameTitleID = false;

    await XboxClient.RefreshToken();
    let m_Presence = await XboxClient.GetPresence();
    if (m_Presence && m_Presence.devices && m_Presence.devices.length > Config.XboxAPI.deviceId)
    {
        let m_Titles = m_Presence.devices[Config.XboxAPI.deviceId].titles;
        let m_TitleIndex = (m_Titles.length - 1);

        // Check if any title has placement set to "Full"
        for (var i = 0; m_Titles.length > i; ++i)
        {
            if (m_Titles[i].placement == "Full")
            {
                m_TitleIndex = i;
                break;
            }
        }

        let m_TitleID = parseInt(m_Titles[m_TitleIndex].id);
        if (m_TitleID == XboxClient.LastTitleID)
            m_IsSameTitleID = true;
        else
        {
            let m_TitleName = m_Titles[m_TitleIndex].name;
            let m_AppID = -1;
            let m_NameMatchCount = 0;

            // Attempt to find AppID by name...
            for (var i = 0; SteamClient.Apps.length > i; ++i)
            {
                let m_App = SteamClient.Apps[i];
                if (m_TitleName.indexOf(m_App.name) == -1)
                    continue;

                // Check how many chars are matching...
                for (var c = 0; m_TitleName.length > c && m_App.name.length > c; ++c)
                {
                    if (m_TitleName[c] != m_App.name[c])
                        break;

                    if (c > m_NameMatchCount)
                    {
                        m_AppID = m_App.appid;
                        m_NameMatchCount = c;
                    }
                }
            }

	        SteamClient.setPersona(SteamUser.EPersonaState.Online);
            
            if (m_AppID == -1)
	            SteamClient.gamesPlayed("Xbox: " + m_TitleName);
            else
                SteamClient.gamesPlayed(m_AppID);

            XboxClient.LastTitleID = m_TitleID;
            console.log("[ STEAM ] Title set to:", m_TitleName);
        }
    }
    else if (XboxClient.LastTitleID != -1) // Couldn't find presence/device - could be offline or we set wrong deviceid...
    {
	    SteamClient.setPersona(SteamUser.EPersonaState.Offline);
	    SteamClient.gamesPlayed();
        
        XboxClient.LastTitleID = -1;
    }

    // We delay update by 1 more minute if title is same so we save some API requests...
    setTimeout(OnUpdate, (m_IsSameTitleID ? Config.UpdateDelay + 1 : Config.UpdateDelay) * 60 * 1000);
}

// Steam Client
SteamClient.on("loggedOn", function(details) 
{
	console.log("[ STEAM ] Successfully logged in!");
    SteamClient.getUserOwnedApps(SteamClient.steamID, {}, function(error, response) 
    {
        if (error)
            console.log("[ ERROR ]", error);
        else
            SteamClient.Apps = response.apps;
        
        OnUpdate();
    });
});

SteamClient.on("error", function(error) 
{
	console.log("[ ERROR ]", error);
});

SteamClient.on("updateMachineAuth", function(sentry, cb)
{
    FS.writeFileSync("./sentry.bin", sentry.bytes);
});

// Xbox Client
XboxClient.OnAuth = async function()
{
    console.log("[ XBOX ] Successfully logged in!");
    SteamClient.logOn({ 
        "accountName": Config.Steam.AccountName, 
        "password": Config.Steam.AccountPassword, 
        "rememberPassword": true,
        "machineName": "XboxPresence"
    });
}

XboxClient.GetPresence = async function()
{
    try
    {
        let m_Presence = await XboxClient.getProvider("userpresence").getCurrentUser();
        return m_Presence;
    }
    catch (error)
    {
        return null;
    }
}

XboxClient.RefreshToken = async function()
{
    try
    {
        let m_OAuth = await XboxClient._authentication.refreshToken(XboxClient._authentication._tokens.oauth.refresh_token);
        XboxClient._authentication._tokens.oauth = m_OAuth;
        XboxClient._authentication.saveTokens();
    }
    catch (error)
    {
        console.log("[ ERROR ] Couldn't refresh token...");
    }
}

XboxClient.Auth = function()
{
    XboxClient.isAuthenticated().then(XboxClient.OnAuth).catch(function(error)
    {
        var m_AuthURL = XboxClient.startAuthServer(function() 
        {
            XboxClient.isAuthenticated().then(XboxClient.OnAuth).catch(function(error) 
            {
                console.log("[ ERROR ] Auth is not valid...");
            });
        });

        console.log("[ XBOX ] Authorize yourself through this link:", m_AuthURL);
    });
};
XboxClient.Auth();