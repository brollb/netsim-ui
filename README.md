# Netsim-UI
Netsim-UI is a graphical interface for netsim, a network simulator written in Javascript.

## Quick Setup
After cloning the repo, run

```
npm install
```

If you are running your mongo database locally, run

```
npm run setup-local
```
Otherwise, run

```
npm run setup -- -m MONGO_URI
```
where `MONGO_URI` is the uri of your given mongo instance. For example:

```
npm run setup -- -m mongodb://127.0.0.1:27017/netsim
```

Next, run

```
npm start
```

Finally, navigate to `localhost:8080` in a browser to use Netsim-UI!
