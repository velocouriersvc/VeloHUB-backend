# Email Setup Guide — Velo Courier Service

> Self-hosted Postfix + OpenDKIM on the VPS so the API can send
> transactional emails (order confirmations, OTPs, driver notifications, etc.)

**VPS:** `38.242.149.20` (Contabo)  
**Domain:** `velocouriersvc.com` (DNS on Namecheap)  
**From address:** `noreply@velocouriersvc.com`  
**K8s namespace:** `velo`  
**Deployment:** `velo-api`

---

## Table of Contents

1. [Install Postfix + OpenDKIM](#1--install-postfix--opendkim)
2. [Configure Postfix](#2--configure-postfix)
3. [Configure OpenDKIM](#3--configure-opendkim)
4. [Generate DKIM Keys](#4--generate-dkim-keys)
5. [Wire OpenDKIM Socket into Postfix](#5--wire-opendkim-socket-into-postfix)
6. [Start & Enable Services](#6--start--enable-services)
7. [DNS Records (Namecheap)](#7--dns-records-namecheap)
8. [Reverse DNS / PTR Record (Contabo)](#8--reverse-dns--ptr-record-contabo)
9. [Connect Node.js API (K8s) to Postfix](#9--connect-nodejs-api-k8s-to-postfix)
10. [Test Sending](#10--test-sending)
11. [Service Management](#11--service-management)
12. [Troubleshooting](#12--troubleshooting)
13. [Alternative: Gmail SMTP](#13--alternative-gmail-smtp)

---

## 1 — Install Postfix + OpenDKIM

SSH into the VPS:

```bash
ssh -i ~/.ssh/emma24 -p 2222 emma24@38.242.149.20
sudo -i
```

Install packages:

```bash
apt update
apt install -y postfix opendkim opendkim-tools mailutils
```

When the Postfix installer asks:
- **General type of mail configuration:** → `Internet Site`
- **System mail name:** → `velocouriersvc.com`

If you missed the prompt or need to reconfigure:

```bash
sudo dpkg-reconfigure postfix
```

Verify installation:

```bash
postconf mail_version        # should show Postfix 3.x
opendkim -V                  # should show OpenDKIM 2.x
which mail                   # should show /usr/bin/mail
```

---

## 2 — Configure Postfix

Open the main config:

```bash
sudo nano /etc/postfix/main.cf
```

Find and set (or add) these values — leave everything else at defaults:

```
# Identity
myhostname = mail.velocouriersvc.com
mydomain = velocouriersvc.com
myorigin = $mydomain

# Only listen on localhost (NOT an open relay)
inet_interfaces = loopback-only
inet_protocols = ipv4

# Accept mail for these destinations
mydestination = $myhostname, localhost.$mydomain, localhost

# No relay — send directly to recipient mail servers
relayhost =

# TLS (use the default snakeoil cert)
smtpd_tls_cert_file = /etc/ssl/certs/ssl-cert-snakeoil.pem
smtpd_tls_key_file = /etc/ssl/private/ssl-cert-snakeoil.key
smtp_tls_security_level = may

# OpenDKIM milter (will be configured below)
milter_protocol = 6
milter_default_action = accept
smtpd_milters = local:opendkim/opendkim.sock
non_smtpd_milters = $smtpd_milters
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X`).

Quick-set method (alternative to editing the file manually):

```bash
sudo postconf -e 'myhostname = mail.velocouriersvc.com'
sudo postconf -e 'mydomain = velocouriersvc.com'
sudo postconf -e 'myorigin = $mydomain'
sudo postconf -e 'inet_interfaces = loopback-only'
sudo postconf -e 'inet_protocols = ipv4'
sudo postconf -e 'mydestination = $myhostname, localhost.$mydomain, localhost'
sudo postconf -e 'relayhost ='
sudo postconf -e 'smtp_tls_security_level = may'
sudo postconf -e 'milter_protocol = 6'
sudo postconf -e 'milter_default_action = accept'
sudo postconf -e 'smtpd_milters = local:opendkim/opendkim.sock'
sudo postconf -e 'non_smtpd_milters = $smtpd_milters'
```

---

## 3 — Configure OpenDKIM

Edit the main config:

```bash
sudo nano /etc/opendkim.conf
```

Replace contents with:

```
Syslog          yes
SyslogSuccess   yes
LogWhy          yes
Canonicalization relaxed/simple
Mode            sv
SubDomains      no
AutoRestart     yes
AutoRestartRate 10/1M
Background      yes
DNSTimeout      5
SignatureAlgorithm rsa-sha256

KeyTable        /etc/opendkim/key.table
SigningTable    refile:/etc/opendkim/signing.table
ExternalIgnoreList  /etc/opendkim/trusted.hosts
InternalHosts       /etc/opendkim/trusted.hosts

UserID          opendkim
UMask           007
Socket          local:/var/spool/postfix/opendkim/opendkim.sock
PidFile         /run/opendkim/opendkim.pid
TrustAnchorFile /usr/share/dns/root.key
```

Create the supporting config files:

```bash
# Create directories
sudo mkdir -p /etc/opendkim/keys/velocouriersvc.com
sudo mkdir -p /var/spool/postfix/opendkim

# key.table — maps selector to key file
sudo tee /etc/opendkim/key.table > /dev/null <<'EOF'
mail._domainkey.velocouriersvc.com velocouriersvc.com:mail:/etc/opendkim/keys/velocouriersvc.com/mail.private
EOF

# signing.table — maps sender addresses to key table entry
sudo tee /etc/opendkim/signing.table > /dev/null <<'EOF'
*@velocouriersvc.com mail._domainkey.velocouriersvc.com
EOF

# trusted.hosts — hosts that can send signed mail
sudo tee /etc/opendkim/trusted.hosts > /dev/null <<'EOF'
127.0.0.1
localhost
velocouriersvc.com
*.velocouriersvc.com
EOF
```

---

## 4 — Generate DKIM Keys

```bash
sudo opendkim-genkey -b 2048 -d velocouriersvc.com -D /etc/opendkim/keys/velocouriersvc.com/ -s mail -v
```

This creates two files:
- `/etc/opendkim/keys/velocouriersvc.com/mail.private` — private key (stays on server)
- `/etc/opendkim/keys/velocouriersvc.com/mail.txt` — public key (goes in DNS)

Set ownership:

```bash
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod 600 /etc/opendkim/keys/velocouriersvc.com/mail.private
```

Display the public key (you'll need this for the DNS DKIM record):

```bash
sudo cat /etc/opendkim/keys/velocouriersvc.com/mail.txt
```

The output for this VPS is:

```
mail._domainkey	IN	TXT	( "v=DKIM1; h=sha256; k=rsa; "
	  "p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApsQJqfn27vLojUBJDDnLMFWkR0nH6LeL6bpkNfgv1D5hcLDTB9is9G2oxTJ2GcjpEjPA/uPF2D7FrJFBVF5wBS6gsl9+1B8pY6zGsgju69doaz25D3Vt5+UHbi01I0RCPZtNwVQFtXHd12116BH/3EcgYuA12dUgw2Pk2rdGf7CKr7jtz3Ji3eUXC/UxDQQ2C6iyvan7qCtptn"
	  "a9C0bioOsbPg4HLy3CNEukKqVZQxN5T5dSEpeJAEtBO4RiHWzZLPlyvAoks9E2YQSEsAU9MdzZyTDtcMzrH8WPWw0B6a/T574IC08wqhvpgyZQx93HbZoyH5gQJwlJApqZS3HsOQIDAQAB" )  ; ----- DKIM key mail for velocouriersvc.com
```

For the **Namecheap DNS record**, combine into one continuous string (no quotes or line breaks):

---

## 5 — Wire OpenDKIM Socket into Postfix

Postfix runs in a chroot, so OpenDKIM must create its socket inside the Postfix spool:

```bash
# Create socket directory inside Postfix chroot
sudo mkdir -p /var/spool/postfix/opendkim
sudo chown opendkim:postfix /var/spool/postfix/opendkim
sudo chmod 750 /var/spool/postfix/opendkim

# Add postfix user to opendkim group
sudo usermod -aG opendkim postfix
```

Also update `/etc/default/opendkim` to ensure the socket path matches:

```bash
sudo tee /etc/default/opendkim > /dev/null <<'EOF'
RUNDIR=/run/opendkim
SOCKET="local:/var/spool/postfix/opendkim/opendkim.sock"
USER=opendkim
GROUP=opendkim
PIDFILE=$RUNDIR/opendkim.pid
EXTRAAFTER=
EOF
```

---

## 6 — Start & Enable Services

```bash
# Restart both services
sudo systemctl restart opendkim
sudo systemctl restart postfix

# Enable on boot
sudo systemctl enable opendkim
sudo systemctl enable postfix

# Verify they're running
sudo systemctl status opendkim
sudo systemctl status postfix
```

Both should show `active (running)`.

If OpenDKIM fails, check:

```bash
sudo journalctl -u opendkim -n 30 --no-pager
```

Common fix — socket permissions:

```bash
sudo chown opendkim:postfix /var/spool/postfix/opendkim
sudo chmod 750 /var/spool/postfix/opendkim
sudo systemctl restart opendkim
sudo systemctl restart postfix
```

---

## 7 — DNS Records (Namecheap)

Go to **Namecheap → Domain List → velocouriersvc.com → Advanced DNS**.

Add these records:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| **A** | `mail` | `38.242.149.20` | Automatic |
| **MX** | `@` | `mail.velocouriersvc.com` (priority **10**) | Automatic |
| **TXT** (SPF) | `@` | `v=spf1 ip4:38.242.149.20 ~all` | Automatic |
| **TXT** (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@velocouriersvc.com` | Automatic |
| **TXT** (DKIM) | `mail._domainkey` | *(see below)* | Automatic |

**DKIM TXT value** (copy this entire string into the Value field on Namecheap):

```
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApsQJqfn27vLojUBJDDnLMFWkR0nH6LeL6bpkNfgv1D5hcLDTB9is9G2oxTJ2GcjpEjPA/uPF2D7FrJFBVF5wBS6gsl9+1B8pY6zGsgju69doaz25D3Vt5+UHbi01I0RCPZtNwVQFtXHd12116BH/3EcgYuA12dUgw2Pk2rdGf7CKr7jtz3Ji3eUXC/UxDQQ2C6iyvan7qCtptna9C0bioOsbPg4HLy3CNEukKqVZQxN5T5dSEpeJAEtBO4RiHWzZLPlyvAoks9E2YQSEsAU9MdzZyTDtcMzrH8WPWw0B6a/T574IC08wqhvpgyZQx93HbZoyH5gQJwlJApqZS3HsOQIDAQAB
```

### Verify DNS (after ~5–15 minutes propagation)

```bash
# SPF
dig TXT velocouriersvc.com +short
# Should contain: "v=spf1 ip4:38.242.149.20 ~all"

# DKIM
dig TXT mail._domainkey.velocouriersvc.com +short
# Should contain: "v=DKIM1; h=sha256; k=rsa; p=..."

# DMARC
dig TXT _dmarc.velocouriersvc.com +short
# Should contain: "v=DMARC1; p=none; ..."

# MX
dig MX velocouriersvc.com +short
# Should show: 10 mail.velocouriersvc.com.

# A record for mail subdomain
dig A mail.velocouriersvc.com +short
# Should show: 38.242.149.20
```

---

## 8 — Reverse DNS / PTR Record (Contabo)

**This is critical for deliverability.** Gmail/Outlook check that your IP's
PTR record matches your mail hostname. Without it, emails go to spam.

1. Log in to **https://my.contabo.com**
2. Go to your VPS → **Reverse DNS Management**
3. Set the PTR for `38.242.149.20` → `mail.velocouriersvc.com`
4. Save and wait for propagation (~15 min to a few hours)

Verify:

```bash
dig -x 38.242.149.20 +short
# Expected: mail.velocouriersvc.com.
```

---

## 9 — Connect Node.js API (K8s) to Postfix

The Velo API runs inside K8s (K3s) pods. Postfix runs on the **host** (the VPS itself).
Pods reach the host via the **pod gateway IP**.

### 9.1 — Find the pod gateway IP

```bash
sudo kubectl -n velo exec deploy/velo-api -- ip route | grep default
# Output: default via 10.42.0.1 dev eth0
# The gateway IP is: 10.42.0.1
```

### 9.2 — Update the K8s ConfigMap

Add SMTP env vars to the existing configmap:

```bash
sudo kubectl -n velo patch configmap velo-config --type merge -p '{
  "data": {
    "SMTP_HOST": "10.42.0.1",
    "SMTP_PORT": "25",
    "SMTP_FROM": "noreply@velocouriersvc.com",
    "SMTP_FROM_NAME": "Velo Courier"
  }
}'
```

### 9.3 — Restart the API pods (to pick up new env vars)

```bash
sudo kubectl -n velo rollout restart deployment/velo-api
sudo kubectl -n velo rollout status deployment/velo-api
```

### 9.4 — Verify env vars inside a pod

```bash
sudo kubectl -n velo exec deploy/velo-api -- printenv | grep SMTP
# SMTP_HOST=10.42.0.1
# SMTP_PORT=25
# SMTP_FROM=noreply@velocouriersvc.com
# SMTP_FROM_NAME=Velo Courier
```

### 9.5 — Firewall: Allow pods to reach Postfix

If UFW is enabled, K3s pod traffic to port 25 on the host must be allowed:

```bash
# Allow traffic from the K3s pod CIDR to port 25
sudo ufw allow from 10.42.0.0/16 to any port 25 proto tcp comment "K3s pods → Postfix"
sudo ufw reload
```

---

## 10 — Test Sending

### From the VPS host (direct Postfix test)

```bash
echo "Hello from Velo Courier" | mail -s "Velo Test Email" -a "From: noreply@velocouriersvc.com" your-email@gmail.com
```

### Watch the mail log

```bash
sudo tail -f /var/log/mail.log
```

Look for `status=sent` — that means Postfix delivered it.

### From inside a K8s pod (test pod → Postfix connectivity)

```bash
# Install telnet in a temp pod
sudo kubectl -n velo run mail-test --rm -it --image=busybox -- sh

# Inside the pod:
telnet 10.42.0.1 25
# You should see: 220 mail.velocouriersvc.com ESMTP Postfix
# Type QUIT to exit
```

### Check mail queue

```bash
sudo mailq                 # show queued messages
sudo postqueue -f          # flush (retry) stuck messages
sudo postsuper -d ALL      # delete all queued messages
```

### Verify DKIM is signing

After sending a test, check the raw email headers in Gmail:
- Click the ⋮ menu → "Show original"
- Look for `DKIM-Signature: v=1; a=rsa-sha256; d=velocouriersvc.com; s=mail; ...`
- Look for `Authentication-Results:` — it should show `dkim=pass`

### Online verification tools

- **Mail-tester:** https://www.mail-tester.com — send to their address, get a score /10
- **MXToolbox:** https://mxtoolbox.com/dkim.aspx — test DKIM record
- **DMARC Check:** https://dmarcian.com/dmarc-inspector/

---

## 11 — Service Management

```bash
# Restart Postfix
sudo systemctl restart postfix

# Restart OpenDKIM
sudo systemctl restart opendkim

# Check status
sudo systemctl status postfix
sudo systemctl status opendkim

# View Postfix effective config
sudo postconf -n

# Test OpenDKIM key
sudo opendkim-testkey -d velocouriersvc.com -s mail -vvv
# Should end with: key OK
```

---

## 12 — Troubleshooting

| Problem | Fix |
|---------|-----|
| `Permission denied` on opendkim.sock | `sudo chown opendkim:postfix /var/spool/postfix/opendkim && sudo chmod 750 /var/spool/postfix/opendkim` then restart both services |
| `valid hostname required in server description: =` | `relayhost` line is malformed — run `sudo postconf -e 'relayhost ='` |
| Gmail rejects with `no PTR record` | Either Postfix used IPv6 (`sudo postconf -e 'inet_protocols = ipv4'`) or PTR not set in Contabo panel |
| Gmail rejects with `SPF did not pass` | Verify SPF TXT record: `dig TXT velocouriersvc.com +short` — must contain `ip4:38.242.149.20` |
| Emails land in spam | 1) Set PTR record (Step 8), 2) Verify DKIM (`opendkim-testkey -d velocouriersvc.com -s mail -vvv`), 3) Check score at mail-tester.com |
| `Connection refused` from K8s pod to port 25 | UFW blocking — run `sudo ufw allow from 10.42.0.0/16 to any port 25 proto tcp` |
| `Connection timed out` sending to Gmail | Contabo may block port 25 outbound — contact support to unblock, or use Gmail SMTP (Step 13) |
| OpenDKIM won't start | Check `sudo journalctl -u opendkim -n 30` — usually syntax error in config or missing key file |
| `key not secure` in opendkim-testkey | Normal warning (no DNSSEC). DKIM still works. Only worry if `key FAILED` |
| Bounce messages fill the queue | Add VPS hostname to `mydestination`: `sudo postconf -e 'mydestination = $myhostname, localhost.$mydomain, localhost, YOUR_VPS_HOSTNAME'` then flush |

---

## 13 — Alternative: Gmail SMTP

If Contabo blocks port 25 outbound or deliverability is poor, use Gmail as a relay.

**Cost:** Free · **Limit:** 500 emails/day · **Deliverability:** Excellent

### Steps

1. **Use or create a Gmail account** (e.g. `velo.noreply@gmail.com`)

2. **Enable 2-Step Verification:**
   https://myaccount.google.com/security

3. **Generate an App Password:**
   https://myaccount.google.com/apppasswords
   → Select "Mail" → "Other" → name it "Velo VPS"
   → Copy the 16-character password

4. **Update K8s ConfigMap:**

   ```bash
   sudo kubectl -n velo patch configmap velo-config --type merge -p '{
     "data": {
       "SMTP_HOST": "smtp.gmail.com",
       "SMTP_PORT": "587",
       "SMTP_SECURE": "false",
       "SMTP_AUTH": "true",
       "SMTP_USER": "velo.noreply@gmail.com",
       "SMTP_FROM": "velo.noreply@gmail.com",
       "SMTP_FROM_NAME": "Velo Courier"
     }
   }'
   ```

5. **Create/update the SMTP password in K8s secret:**

   ```bash
   sudo kubectl -n velo patch secret velo-secrets --type merge -p "{
     \"data\": {
       \"SMTP_PASSWORD\": \"$(echo -n 'your-16-char-app-password' | base64)\"
     }
   }"
   ```

6. **Restart pods:**

   ```bash
   sudo kubectl -n velo rollout restart deployment/velo-api
   ```

> With Gmail SMTP, you don't need Postfix, OpenDKIM, or any DNS email records.
> The `From:` address will show as the Gmail account.

---

## Summary — All DNS Records for `velocouriersvc.com`

| # | Type | Host | Value |
|---|------|------|-------|
| 1 | A | `mail` | `38.242.149.20` |
| 2 | MX | `@` | `mail.velocouriersvc.com` (priority 10) |
| 3 | TXT | `@` | `v=spf1 ip4:38.242.149.20 ~all` |
| 4 | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:admin@velocouriersvc.com` |
| 5 | TXT | `mail._domainkey` | *(full DKIM value below)* |

**Record #5 — DKIM value** (copy-paste ready for Namecheap):

```
v=DKIM1; h=sha256; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApsQJqfn27vLojUBJDDnLMFWkR0nH6LeL6bpkNfgv1D5hcLDTB9is9G2oxTJ2GcjpEjPA/uPF2D7FrJFBVF5wBS6gsl9+1B8pY6zGsgju69doaz25D3Vt5+UHbi01I0RCPZtNwVQFtXHd12116BH/3EcgYuA12dUgw2Pk2rdGf7CKr7jtz3Ji3eUXC/UxDQQ2C6iyvan7qCtptna9C0bioOsbPg4HLy3CNEukKqVZQxN5T5dSEpeJAEtBO4RiHWzZLPlyvAoks9E2YQSEsAU9MdzZyTDtcMzrH8WPWw0B6a/T574IC08wqhvpgyZQx93HbZoyH5gQJwlJApqZS3HsOQIDAQAB
```

**Plus:** PTR record `38.242.149.20` → `mail.velocouriersvc.com` in Contabo panel.