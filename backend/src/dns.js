import dns from 'node:dns';

// Algunos routers/ISP rechazan las consultas SRV de mongodb+srv; se usan DNS públicos.
dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');
