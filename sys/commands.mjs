const Catalog = {
   test: async ({ command, ack, say}) => {
      await say('Hello World!');
   }
};
export default Catalog;
