const config = {
   //Config points for logs files
   logs: {
      //File path that leads to the directory that houses all log files (and meta data)
      directory: './logs',
      //Amount of time that passes until a new log file is created (used for better organize the log files)
      interval: 1,
      //Unit of time used for the interval value. Compatible units:  'Seconds', 'Minutes', 'Hours', 'Days', 'Weeks', 'Months', 'Years
      interval_unit: 'Months'
   }
}
export default config;
