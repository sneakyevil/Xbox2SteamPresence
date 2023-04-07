const SteamUser = require("steam-user");
const XboxWebAPI = require("xbox-webapi");
const StringSimilarity = require("string-similarity");

const Config = require("./config.json");
const CustomTitles = require("./customtitles.json");

// Main
var SteamClient = new SteamUser({ "dataDirectory": "./SteamData/", "singleSentryfile": true });
var XboxClient = XboxWebAPI({ clientId: Config.XboxAPI.clientId, clientSecret: Config.XboxAPI.clientSecret });

SteamClient.Apps = [];
XboxClient.LastTitleID = -1;

async function OnUpdate()
{
    let m_DelayUpdate = false;

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
            m_DelayUpdate = true;
        else
        {
            let m_TitleName = m_Titles[m_TitleIndex].name;
            let m_AppID = -1;

            let m_HasCustomTitle = false;
            for (var i = 0; CustomTitles.length > i; ++i)
            {
                if (CustomTitles[i].TitleID == m_TitleID)
                {
                    m_TitleName = CustomTitles[i].Name;
                    m_AppID = CustomTitles[i].AppID;

                    m_HasCustomTitle = true;
                    break;
                }
            }

             // Attempt to find AppID by name...
            if (!m_HasCustomTitle)
            {
                let m_BestSimilarity = Config.GameNameSimilarity;
                for (var i = 0; SteamClient.Apps.length > i; ++i)
                {
                    let m_App = SteamClient.Apps[i];
                    let m_AppNameSimilarity = StringSimilarity.compareTwoStrings(m_TitleName, m_App.name);
                    if (m_BestSimilarity > m_AppNameSimilarity)
                        continue;

                    m_AppID = m_App.appid;
                    m_BestSimilarity = m_AppNameSimilarity;
                }
            }

	        SteamClient.setPersona(SteamUser.EPersonaState.Online);
            
            if (m_AppID == -1)
            {
	            SteamClient.gamesPlayed("Xbox: " + m_TitleName);          
                console.log("[ STEAM ] Setting title to: " + m_TitleName + " (" + m_TitleID + ")");
            }
            else
            {
                SteamClient.gamesPlayed(m_AppID);  
                console.log("[ STEAM ] Setting appID to: " + m_AppID);
            }

            XboxClient.LastTitleID = m_TitleID;
        }
    }
    else 
    {
        m_DelayUpdate = true;
        
        if (XboxClient.LastTitleID != -1) // Couldn't find presence/device - could be offline or we set wrong deviceid...
        {
            SteamClient.setPersona(SteamUser.EPersonaState.Offline);
            SteamClient.gamesPlayed();
            
            XboxClient.LastTitleID = -1;
            console.log("[ STEAM ] No presence found, going offline...");
        }
    }

    setTimeout(OnUpdate, (m_DelayUpdate ? Config.UpdateDelay + 1 : Config.UpdateDelay) * 60 * 1000);
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

// Xbox Client
XboxClient.OnAuth = async function()
{
    console.log("[ XBOX ] Successfully logged in!");
    SteamClient.logOn({ 
        "accountName": Config.Steam.AccountName, 
        "password": Config.Steam.AccountPassword, 
        "rememberPassword": true,
        "machineName": "XboxPresence",
        "logonID": Config.Steam.LogonID // Prevent LogonSessionReplaced
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

XboxClient.RefreshTokenFailNum = 0;
XboxClient.RefreshToken = async function()
{
    try
    {
        await XboxClient._authentication.refreshTokens("oauth");
        XboxClient.RefreshTokenFailNum = 0;
    }
    catch (error)
    {
        ++XboxClient.RefreshTokenFailNum;

        if (XboxClient.RefreshTokenFailNum >= 30)
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