export default {
  attributionVerbs: "сказав|сказала|відповів|відповіла|прошепотів|прошепотіла|закричав|закричала|вигукнув|вигукнула|мовив|мовила|пробурмотів|спитав|спитала|запитав|запитала|повідомив|повідомила",
  system: /^(\[[^\]]+\]|(?:система|system)\s*[:：-])/iu,
  thought: /(подумав|подумала|думав|думала|про себе)/iu,
  descriptors: [
    [/(старий|літній чоловік|дід|дідусь)/iu,{gender:"male",ageGroup:"elderly",displayName:"Старий",canonicalName:"старий",rough:true}], [/(стара жінка|бабуся|стара)/iu,{gender:"female",ageGroup:"elderly",displayName:"Стара",canonicalName:"стара жінка"}], [/(хлопчик)/iu,{gender:"male",ageGroup:"child",displayName:"Хлопчик",canonicalName:"хлопчик"}], [/(дівчинка)/iu,{gender:"female",ageGroup:"child",displayName:"Дівчинка",canonicalName:"дівчинка"}], [/(юнак|молодий чоловік)/iu,{gender:"male",ageGroup:"young",displayName:"Юнак",canonicalName:"юнак"}], [/(дівчина|молода жінка)/iu,{gender:"female",ageGroup:"young",displayName:"Дівчина",canonicalName:"дівчина"}], [/(система)/iu,{gender:"neutral",ageGroup:"unknown",characterRole:"system",displayName:"Система",canonicalName:"система"}], [/(монстр|демон|звір|істота)/iu,{gender:"unknown",ageGroup:"unknown",characterRole:"creature",displayName:"Істота",canonicalName:"істота"}]
  ],
  emotions: [[/закрич|люто|гнівно|розлюч/iu,"angry"],[/налякан|тремтя|жах/iu,"afraid"],[/засмія|радіс|щаслив/iu,"happy"],[/сумно|заплакав|заплакала|сльоз/iu,"sad"],[/твердо|рішуч|стиснув кулаки|не відступ/iu,"determined"],[/здивован|здивував/iu,"surprised"],[/прошепот|таємнич/iu,"mysterious"],[/втомлен|стомлен/iu,"tired"],[/схвильован|збуджен/iu,"excited"]]
};
