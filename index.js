import express,{json} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from "mongodb";
import { stripHtml } from 'string-strip-html';
import dayjs from "dayjs";
import joi from 'joi';
const app= express();
app.use(json());
app.use(cors());
dotenv.config();
let db = null;
/*Armazenamento de dados*/ 
const mongoClient = new MongoClient(process.env.MONGO_URI);
const promise= mongoClient.connect();

promise.then(()=>{
    db= mongoClient.db(process.env.BANCO);
    console.log("Conexao com MongoDB ");
});

promise.catch((e)=>console.log("Erro conexao com banco de dados",e));

/* POST/participants*/
app.post("/participants",async(req,res)=>{
const participante ={name:stripHtml(req.body.name).result.trim()}
const participantesquema= joi.object({name: joi.string().min(1).required()})
const {error}=participantesquema.validate(participante)
if(error){
    console.log(error)
    return res.sendStatus(422);
}

try {
    const existeparticipante= await db.collection("participants").findOne({name: participante.name})
    if(existeparticipante){
        return res.sendStatus(409);
    }
await db.collection( "participants").insertOne({name: participante.name, lastStatus: Date.now()})
await db.collection("messages").insertOne({from: participante.name, to: 'Todos', text: 'entra na sala...', type: 'status', time: dayjs().format('HH:MM:SS')})
res.sendStatus(201);

} catch (e) {
    console.log(e)
    return res.status(500).send("Erro no registro do usuario!",e);
}

});

/*Get /participants*/
app.get("/participants",async(req,res)=>{
    try {
        const participants= await db.collection("participants").find().toArray();
        res.send(participants);
    } catch (error) {
        console.log(error)
        return res.status(500).send("Erro no registro do usuario!",error);
    }
});
/*Post/messages*/
app.post("/messages",async(req,res)=>{
    
    
    const message=req.body;

  const   esquemamensage= joi.object({
     
        to: joi.string().required(),
        text:joi.string().required(),
        type: joi.string().valid('message','private_message').required(),


    })
    const {error}= esquemamensage.validate(message,{abortEarly:false});
if(error){
    return res.status(422).send(error.details.map(detail=>detail.message));
}
/*from*/
const{user}=req.headers;
try {
    const participante= await db.collection("participants").findOne({name:user});
    if(!participante){
        return res.sendStatus(422);
    }   

await db.collection("messages").insertOne({
                from: (stripHtml(user).result).trim(),
                to: (stripHtml(req.body.to).result).trim(),
                text: (stripHtml(req.body.text).result).trim(),
                type: (stripHtml(req.body.type).result).trim(),
                time: dayjs().format('HH:mm:ss'),
})

res.sendStatus(201);

} catch (error) {
return res.status(422).send("Vc nao existe");
}
});

/*Get/messages*/
app.get("/messages",async(req,res)=>{
const limit= parseInt(req.query.limit);
const {user}= req.headers;
try {
const messages= await db.collection('messages').find().toArray(); 
const filtermessages= messages.filter(message =>{
    const {from,to,type}= message;
    const toUser= to==="Todos"|| (to === user || from === user);
    const isPublic= type ==="message";
    return toUser || isPublic;
});
if(limit && limit !== NaN){
   return res.send(filtermessages.slice(-limit));
}
res.send(filtermessages);
} catch (error) {
    console.log(error)
    return res.status(500).send("Erro ao obter messages!",error);
}

});
/* Post /status*/
app.post("/status",async(req,res)=>{
   const{user}= req.headers;
   try {
    const participante= await db.collection("participants").findOne({name: user})
    if(!participante) return res.sendStatus(404);
    await db.collection("participants").updateOne({name: user},{$set:{lastStatus: Date.now()}});
    res.sendStatus(200);
} catch (error) {
    console.log(error)
    return res.status(500).send("Erro ao atualizar status!",error);
   } 
});

/*Remoção automática de usuários inativos*/
const Tempo= 15*1000;
setInterval(async()=>{
const seconds= Date.now()-(10*1000);
try {
  const inactive= await db.collection("participants").find({lastStatus: {$lte: seconds}}).toArray();  
    if (inactive.length>0){
    const msginativo = inactive.map (participanteInativo => {  return{
        from: participanteInativo.name,
        to:'Todos',
        text:'sai da sala...',
        type:'status',
        time: dayjs().format('HH:MM:SS')
    }});
     
    await db.collection("menssages").insertMany(msginativo);
    await db.collection("participants").deleteMany({lastStatus: {$lte: seconds}});
} 
}
catch (e) {
    console.log(e)
    return res.status(500).send("Erro ao remover usúarios inativos!",e); 
}
}, Tempo);
app.delete('/messages/:id', async (req, res) => {
    const { id } = req.params;
    const { user } = req.headers;
    try {
        const message = await db
            .collection('messages')
            .findOne({ _id: new ObjectId(id) });
        if (message) {
            if (message.from === user) {
                await db
                    .collection('messages')
                    .deleteOne({ _id: new ObjectId(id) });
                res.sendStatus(200);
            } else {
                res.sendStatus(401);
            }
        } else {
            res.sendStatus(404);
        }
    } catch (err) {
        console.log(err);
    }
});

/*A porta utilizada pelo seu servidor deve ser a 5000*/
const port= process.env.PORT || 5000;
app.listen(port,()=>{
console.log (`Servidor Funcionando ${port}`)
});
 
