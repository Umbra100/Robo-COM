class ConfigFile {

/** The directory used to decide where log files are stored and manipulated. Please note that if you change this you
will also have to either move all existing files to the new directory. Or reset the metadata file and delete the 
existing log files.*/
   static log_directory = './logs';

/** The amount of time the app waits before creating a new log file. This makes things better to organize. Please set
these two values according to each other. */
   static log_time_interval = 2;
   static log_time_unit = 'Weeks';

}
export default ConfigFile;
