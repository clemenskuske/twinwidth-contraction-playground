const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const T = require('./engine.js');
const context = {window: {}};
vm.runInNewContext(fs.readFileSync(`${__dirname}/research-data.js`, 'utf8'), context);
const examples = JSON.parse(JSON.stringify(context.window.TwinWidthResearch));
const same = (a,b) => a.join(',') === b.join(',');

for (const example of examples) {
  for (const kind of ['ordinary','local']) {
    test(`${example.id}: complete ${kind} certificate preserves bags and width`, () => {
      const session = new T.Session();
      session.resetCandidate(example);
      assert.equal(Object.keys(session.graph.edges).length,example.m);
      for (const [a,b] of example[kind].sequence) {
        const source = session.graph.nodes.find(node => same(node.members,a));
        const target = session.graph.nodes.find(node => same(node.members,b));
        assert.ok(source && target);
        if (kind === 'local') {
          assert.ok(T.edge(session.graph,source.id,target.id) || session.graph.nodes.some(node => T.edge(session.graph,source.id,node.id) && T.edge(session.graph,target.id,node.id)));
        }
        session.merge(source.id,target.id);
        assert.ok(session.graph.peak <= example[kind].width);
      }
      assert.equal(session.graph.nodes.length,1);
      assert.equal(session.graph.nodes[0].members.length,example.n);
      assert.equal(session.history.length,example.n-1);
    });
  }
}
