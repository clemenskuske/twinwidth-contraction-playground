#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <random>
#include <string>
#include <unordered_set>
#include <utility>
#include <vector>
using namespace std;

// Exact d-sequence decision for at most 40 vertices. A state is a partition of
// the original vertices. Its trigraph is uniquely determined by that partition.
struct State {
    vector<uint64_t> bags;
    vector<vector<uint8_t>> c; // 0 absent, 1 black, 2 red
};
struct Candidate { int i, j, score, red, distance, maxred; };

struct Solver {
    int d, mode;
    int initial_n = 0, min_local_prefix = 0;
    int max_merge_distance = 0;
    uint64_t target_a = 0, target_b = 0;
    long long nodes = 0, cache_hits = 0, degree_prunes = 0;
    bool timed_out = false;
    chrono::steady_clock::time_point deadline;
    unordered_set<string> failed;
    vector<pair<uint64_t,uint64_t>> witness;

    string key(const State& s, bool target_hit = false) {
        string out;
        out.reserve(s.bags.size() * 8 + 1);
        if (mode==4) out.push_back(target_hit ? '\1' : '\0');
        for (uint64_t b : s.bags) for (int shift=0; shift<64; shift+=8)
            out.push_back(char((b >> shift) & 255));
        return out;
    }
    State merge(const State& s, int i, int j) {
        int k = (int)s.bags.size();
        vector<pair<uint64_t,int>> order;
        for (int a=0; a<k; ++a) if (a!=i && a!=j) order.push_back({s.bags[a], a});
        order.push_back({s.bags[i] | s.bags[j], -1});
        sort(order.begin(), order.end());
        State t;
        t.bags.resize(k-1);
        t.c.assign(k-1, vector<uint8_t>(k-1,0));
        for (int a=0; a<k-1; ++a) t.bags[a] = order[a].first;
        for (int a=0; a<k-1; ++a) for (int b=a+1; b<k-1; ++b) {
            int x=order[a].second, y=order[b].second;
            uint8_t col = x<0 ? (s.c[i][y]==s.c[j][y] ? s.c[i][y] : 2)
                               : y<0 ? (s.c[i][x]==s.c[j][x] ? s.c[i][x] : 2)
                                     : s.c[x][y];
            t.c[a][b] = t.c[b][a] = col;
        }
        return t;
    }
    int pair_distance(const State& s, int i, int j) {
        if (s.c[i][j]) return 1;
        int k = (int)s.bags.size();
        for (int x=0;x<k;++x) if (s.c[i][x] && s.c[j][x]) return 2;
        if (mode!=3 && mode!=4 && mode!=6) return 3; // Other modes only need local/nonlocal.
        vector<int> distance(k,-1), queue;
        distance[i]=0; queue.push_back(i);
        for (size_t head=0;head<queue.size();++head) {
            int x=queue[head];
            for (int y=0;y<k;++y) if (s.c[x][y] && distance[y]<0) {
                distance[y]=distance[x]+1;
                if (y==j) return distance[y];
                queue.push_back(y);
            }
        }
        return k+1;
    }
    vector<Candidate> candidates(const State& s, bool target_hit = false) {
        int k = (int)s.bags.size();
        vector<int> rd(k,0), td(k,0);
        for (int i=0;i<k;++i) for (int j=i+1;j<k;++j) {
            if (s.c[i][j]) { ++td[i]; ++td[j]; }
            if (s.c[i][j]==2) { ++rd[i]; ++rd[j]; }
        }
        vector<Candidate> result;
        for (int i=0;i<k;++i) for (int j=i+1;j<k;++j) {
            if (mode==4 && !target_hit) {
                uint64_t joined = s.bags[i] | s.bags[j];
                bool target_pair = (s.bags[i]==target_a && s.bags[j]==target_b) ||
                                   (s.bags[i]==target_b && s.bags[j]==target_a);
                if (!target_pair && (((joined & target_a) && (joined & ~target_a)) ||
                                     ((joined & target_b) && (joined & ~target_b)))) continue;
            }
            int distance = pair_distance(s,i,j);
            if ((mode==2 && distance>2) || (mode==3 && distance>3)) continue;
            if ((mode==5 || mode==6) && initial_n-k<min_local_prefix && distance>2) continue;
            if (mode==6 && distance>max_merge_distance) continue;
            if (mode==4 && !target_hit &&
                ((s.bags[i]==target_a && s.bags[j]==target_b) ||
                 (s.bags[i]==target_b && s.bags[j]==target_a)) && distance!=3) continue;
            // For distance > 2 the neighborhoods are disjoint. All incident
            // edges become red, so this is a valid branch prune for width d.
            if (distance>2 && td[i]+td[j]>d) { ++degree_prunes; continue; }
            int newrd=0, maxrd=0, totalrd=0;
            for (int x=0;x<k;++x) if (x!=i && x!=j) {
                int nc = s.c[i][x]==s.c[j][x] ? s.c[i][x] : 2;
                int xr = rd[x] - (s.c[x][i]==2) - (s.c[x][j]==2) + (nc==2);
                if (nc==2) ++newrd;
                maxrd = max(maxrd,xr);
                totalrd += xr;
            }
            maxrd=max(maxrd,newrd);
            if (maxrd>d) continue;
            result.push_back({i,j,maxrd*10000+newrd*100+totalrd,newrd,distance,maxrd});
        }
        sort(result.begin(),result.end(),[](const Candidate& a,const Candidate& b){
            if (a.score!=b.score) return a.score<b.score;
            return a.distance<b.distance;
        });
        if (mode==5 || mode==6) stable_sort(result.begin(),result.end(),[](const Candidate& a,const Candidate& b){
            return (a.distance<=2) > (b.distance<=2);
        });
        return result;
    }
    int dfs(const State& s, bool target_hit = false) {
        ++nodes;
        if ((nodes & 1023)==0 && chrono::steady_clock::now()>=deadline) {
            timed_out=true; return -1;
        }
        if (s.bags.size()<=1) return mode!=4 || target_hit ? 1 : 0;
        string h=key(s,target_hit);
        if (failed.find(h)!=failed.end()) { ++cache_hits; return 0; }
        auto cs=candidates(s,target_hit);
        for (auto q:cs) {
            State t=merge(s,q.i,q.j);
            bool hit = target_hit || (mode==4 &&
                ((s.bags[q.i]==target_a && s.bags[q.j]==target_b) ||
                 (s.bags[q.i]==target_b && s.bags[q.j]==target_a)));
            int ans=dfs(t,hit);
            if (ans==1) {
                witness.insert(witness.begin(),{s.bags[q.i],s.bags[q.j]});
                return 1;
            }
            if (ans==-1) return -1;
        }
        failed.insert(std::move(h));
        return 0;
    }

    int greedy(const State& initial, int budget_ms) {
        uint64_t seed = 1469598103934665603ull;
        for (const auto& row : initial.c) for (uint8_t col : row)
            seed = (seed ^ col) * 1099511628211ull;
        mt19937_64 rng(seed);
        auto stop = chrono::steady_clock::now() + chrono::milliseconds(budget_ms);
        int best = (int)initial.bags.size();
        bool first = true;
        while (first || chrono::steady_clock::now() < stop) {
            State s = initial;
            vector<pair<uint64_t,uint64_t>> path;
            int width = 0;
            while (s.bags.size()>1) {
                auto cs = candidates(s);
                if (cs.empty()) break;
                size_t choice = 0;
                if (!first && cs.size()>1) {
                    size_t options = min<size_t>(5, cs.size());
                    // Retain a bias toward the best immediate contraction.
                    choice = (rng() % 3 == 0) ? rng() % options : 0;
                }
                Candidate q = cs[choice];
                width = max(width, q.maxred);
                path.push_back({s.bags[q.i],s.bags[q.j]});
                s = merge(s,q.i,q.j);
                ++nodes;
            }
            if (s.bags.size()==1 && width<best) {
                best=width;
                witness=std::move(path);
            }
            first=false;
            if (best==0) break;
        }
        return best;
    }
};

int main(int argc,char** argv) {
    bool server = argc==2 && string(argv[1])=="--server";
    if (!server && argc<4) { cerr << "usage: twinwidth D MODE(0|2|3|4|5|6) TIMEOUT_MS [TARGET_A TARGET_B | MIN_LOCAL_PREFIX [MAX_DISTANCE]] < graph\n"
                                 << "   or: twinwidth --server < requests\n"; return 2; }
    while (true) {
    int d, mode, ms;
    if (server) { if (!(cin>>d>>mode>>ms)) break; }
    else { d=stoi(argv[1]); mode=stoi(argv[2]); ms=stoi(argv[3]); }
    int n,m;
    if (!(cin>>n>>m)) { if (server) break; cerr << "bad graph header\n"; return 2; }
    if (n<1 || n>40 || m<0) { cerr << "bad graph header\n"; return 2; }
    State s;
    s.c.assign(n,vector<uint8_t>(n,0));
    for (int i=0;i<n;++i) s.bags.push_back(1ull<<i);
    for (int q=0;q<m;++q) {
        int u,v; if (!(cin>>u>>v) || u<0 || v<0 || u>=n || v>=n || u==v || s.c[u][v]) {
            cerr << "bad edge\n"; return 2;
        }
        s.c[u][v]=s.c[v][u]=1;
    }
    Solver solver;
    solver.d=(d<0 ? n : d); solver.mode=mode;
    solver.initial_n=n;
    if (mode==4) {
        if (server || argc!=6) { cerr << "mode 4 needs target bag masks\n"; return 2; }
        solver.target_a=stoull(argv[4]); solver.target_b=stoull(argv[5]);
        if (!solver.target_a || !solver.target_b || (solver.target_a & solver.target_b) ||
            ((solver.target_a | solver.target_b) >> n)) {
            cerr << "invalid target bag masks\n"; return 2;
        }
    }
    if (mode==5) {
        if (server || argc!=5) { cerr << "mode 5 needs a minimum local prefix length\n"; return 2; }
        solver.min_local_prefix=stoi(argv[4]);
        if (solver.min_local_prefix<0 || solver.min_local_prefix>=n) {
            cerr << "invalid minimum local prefix length\n"; return 2;
        }
    }
    if (mode==6) {
        if (server || argc!=6) { cerr << "mode 6 needs a minimum local prefix and maximum merge distance\n"; return 2; }
        solver.min_local_prefix=stoi(argv[4]);
        solver.max_merge_distance=stoi(argv[5]);
        if (solver.min_local_prefix<0 || solver.min_local_prefix>=n ||
            solver.max_merge_distance<2 || solver.max_merge_distance>=n) {
            cerr << "invalid prefix or distance bound\n"; return 2;
        }
    }
    solver.deadline=chrono::steady_clock::now()+chrono::milliseconds(ms);
    auto start=chrono::steady_clock::now();
    int greedy_width = -1;
    int ans;
    if (d<0) { greedy_width=solver.greedy(s,ms); ans=1; }
    else ans=solver.dfs(s);
    double elapsed=chrono::duration<double>(chrono::steady_clock::now()-start).count();
    cout << (d<0 ? "HEURISTIC" : ans==1 ? "YES" : ans==0 ? "NO" : "UNKNOWN")
         << " nodes=" << solver.nodes << " cache=" << solver.cache_hits
         << " degree_prunes=" << solver.degree_prunes << " sec=" << elapsed;
    if (d<0) cout << " width=" << greedy_width;
    cout << '\n';
    if (server) {
        for (auto [a,b]:solver.witness) cout << a << ' ' << b << ' ';
        cout << "END\n" << flush;
    } else {
        if (ans==1) for (auto [a,b]:solver.witness) cout << a << ' ' << b << '\n';
        break;
    }
    }
}
