select i.number as bill, c.name as customer,
       coalesce(r.template_key, s.kind || ' (' || s.offset_days || ' days)') as message,
       r.channel, r.status, r.error,
       r.scheduled_for at time zone 'Asia/Jakarta' as goes_out_jakarta,
       r.amount_shown
  from reminders r
  join invoices i on i.id = r.invoice_id
  join customers c on c.id = i.customer_id
  left join reminder_schedule s on s.id = r.schedule_id
 order by i.number, r.scheduled_for;
 