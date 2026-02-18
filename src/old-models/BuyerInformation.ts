import {Column,Entity,Index,JoinColumn,OneToMany,OneToOne} from "typeorm";
import {Profiles} from './Profiles'
import {EmergencyContacts} from './EmergencyContacts'
import {Orders} from './Orders'
import {RideBookings} from './RideBookings'


@Index("buyer_information_pkey",["id",],{ unique:true })
@Index("idx_buyer_information_id",["id",],{  })
@Entity("buyer_information" ,{schema:"public" } )
export  class BuyerInformation {

@Column("uuid",{ primary:true,name:"id" })
id:string;

@Column("character varying",{ name:"default_payment_method",nullable:true,length:50 })
defaultPaymentMethod:string | null;

@Column("numeric",{ name:"average_rating",nullable:true,precision:3,scale:2,default: () => "0.00", })
averageRating:string | null;

@Column("integer",{ name:"total_rides",nullable:true,default: () => "0", })
totalRides:number | null;

@Column("integer",{ name:"total_orders",nullable:true,default: () => "0", })
totalOrders:number | null;

@Column("timestamp with time zone",{ name:"created_at",nullable:true,default: () => "now()", })
createdAt:Date | null;

@Column("timestamp with time zone",{ name:"updated_at",nullable:true,default: () => "now()", })
updatedAt:Date | null;

@OneToOne(()=>Profiles,profiles=>profiles.buyerInformation,{ onDelete:"CASCADE" })
@JoinColumn([{ name: "id", referencedColumnName: "id" },
])

profile:Profiles;

@OneToMany(()=>EmergencyContacts,emergencyContacts=>emergencyContacts.buyer)


emergencyContacts:EmergencyContacts[];

@OneToMany(()=>Orders,orders=>orders.buyer)


orders:Orders[];

@OneToMany(()=>RideBookings,rideBookings=>rideBookings.buyer)


rideBookings:RideBookings[];

}
