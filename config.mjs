class ConfigFile {

/** The directory used to decide where log files are stored and manipulated. Please note that if you change this you
will also have to either move all existing files to the new directory. Or reset the metadata file and delete the 
existing log files.*/
   static log_directory = './logs';

/** The amount of time the app waits before creating a new log file. This makes things better to organize. Please set
these two values according to each other. */
   static log_time_interval = 2;
   static log_time_unit = 'Months';

/** This is the listening port that the web client will use for its endpoints. This must be set both here and
in the app settings on each of the of the clients used. */
   static server_port = 8000;

/** This is the URL path that the slack app will redirect to in the local host port set by previous config point. 
This must be set both here and in the app settings on each of the of the clients used.*/
   static slack_redirect_path = '/slack-auth'
//* Might be deprecated


/** These are the teasm that a person can choose from when registering for robotics. */
   static team_options = {
      business: {
         prefix: '💠',
         options: [
            'media',
            'finance',
            'outreach',
            'other'
         ]
      },
      robot: {
         prefix: '🤖',
         options: [
            'design',
            'build',
            'programming',
            'wiring',
            'drive',
            'scouting'
         ]
      },
      other: {
         prefix: '🤷‍♂️',
         options: [
            `I Don't Know`
         ]
      }
   }

/** Default settings for someone who first registers for robotics */
   static default_account_settings = {
      /** Whether or not to recieve automated mobile text messages related to robotics*/
      recieve_push_notifications: true
   }
}
export default ConfigFile;
